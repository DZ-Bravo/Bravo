const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider')

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'ap-northeast-2' })
const USER_POOL_ID = process.env.USER_POOL_ID
const CLIENT_ID = process.env.CLIENT_ID

exports.handler = async (event) => {
  // Lambda Function URL을 통해 호출될 때는 event.body가 JSON 문자열
  let body = event.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch (e) {
      // 이미 객체인 경우 그대로 사용
      body = event
    }
  } else if (!body) {
    // event.body가 없으면 event 자체를 사용 (직접 호출 시)
    body = event
  }
  
  const { provider, code, redirectUri, state } = body
  
  try {
    // 1. 네이버/카카오 OAuth 인증 코드로 사용자 정보 조회
    let userInfo = null
    
    if (provider === 'kakao') {
      // 카카오 토큰 요청
      const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: process.env.KAKAO_REST_API_KEY,
          redirect_uri: redirectUri,
          code: code
        })
      })
      const tokenData = await tokenResponse.json()
      
      if (!tokenData.access_token) {
        throw new Error('카카오 토큰 요청 실패: ' + JSON.stringify(tokenData))
      }
      
      // 카카오 사용자 정보 요청
      const userInfoResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      })
      const kakaoUser = await userInfoResponse.json()
      
      if (!kakaoUser.id) {
        throw new Error('카카오 사용자 정보 요청 실패: ' + JSON.stringify(kakaoUser))
      }
      
      const kakaoAccount = kakaoUser.kakao_account || {}
      const profile = kakaoAccount.profile || {}
      
      userInfo = {
        id: `kakao_${kakaoUser.id}`,
        email: kakaoAccount.email || `${kakaoUser.id}@kakao.temp`,
        name: profile.nickname || kakaoAccount.name || `카카오사용자${kakaoUser.id}`,
        provider: 'kakao',
        profileImage: profile.profile_image_url || null
      }
    } else if (provider === 'naver') {
      // 네이버 토큰 요청
      const tokenResponse = await fetch('https://nid.naver.com/oauth2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: process.env.NAVER_CLIENT_ID,
          client_secret: process.env.NAVER_CLIENT_SECRET,
          redirect_uri: redirectUri,
          code: code
        })
      })
      const tokenData = await tokenResponse.json()
      
      if (!tokenData.access_token) {
        throw new Error('네이버 토큰 요청 실패: ' + JSON.stringify(tokenData))
      }
      
      // 네이버 사용자 정보 요청
      const userInfoResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      })
      const naverUserData = await userInfoResponse.json()
      
      if (!naverUserData.response || !naverUserData.response.id) {
        throw new Error('네이버 사용자 정보 요청 실패: ' + JSON.stringify(naverUserData))
      }
      
      const naverUser = naverUserData.response
      userInfo = {
        id: `naver_${naverUser.id}`,
        email: naverUser.email || `${naverUser.id}@naver.temp`,
        name: naverUser.nickname || naverUser.name || `네이버사용자${naverUser.id}`,
        provider: 'naver',
        profileImage: naverUser.profile_image || null
      }
    } else {
      throw new Error(`지원하지 않는 소셜 로그인 제공자: ${provider}`)
    }
    
    // 2. Cognito에서 사용자 찾기 또는 생성
    let cognitoUser = null
    let tempPassword = null
    const username = userInfo.id
    
    try {
      // 사용자가 없으면 생성
      const createUserCommand = new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        UserAttributes: [
          { Name: 'email', Value: userInfo.email },
          { Name: 'name', Value: userInfo.name },
          { Name: 'custom:provider', Value: userInfo.provider }
        ],
        MessageAction: 'SUPPRESS' // 이메일 인증 스킵
      })
      await cognitoClient.send(createUserCommand)
      
      // 임시 비밀번호 생성 및 설정
      tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase() + '!@#'
      const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        Password: tempPassword,
        Permanent: true
      })
      await cognitoClient.send(setPasswordCommand)
      
      cognitoUser = { username, isNew: true }
    } catch (error) {
      if (error.name === 'UsernameExistsException') {
        // 사용자가 이미 존재함
        cognitoUser = { username, isNew: false }
        // 기존 사용자의 경우 비밀번호를 알 수 없으므로 로그인 불가
        // 대신 사용자가 직접 로그인하도록 프론트엔드에서 처리
      } else {
        throw error
      }
    }
    
    // 3. Cognito 로그인 (새 사용자인 경우에만 임시 비밀번호로 로그인)
    let tokens = null
    if (cognitoUser.isNew && tempPassword) {
      try {
        // 임시 비밀번호로 로그인 시도
        const authCommand = new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: CLIENT_ID,
          AuthParameters: {
            USERNAME: username,
            PASSWORD: tempPassword
          }
        })
        
        const authResponse = await cognitoClient.send(authCommand)
        
        if (authResponse.AuthenticationResult) {
          tokens = {
            accessToken: authResponse.AuthenticationResult.AccessToken,
            idToken: authResponse.AuthenticationResult.IdToken,
            refreshToken: authResponse.AuthenticationResult.RefreshToken
          }
        }
      } catch (authError) {
        console.error('Cognito 로그인 오류:', authError)
        // 로그인 실패해도 사용자 정보는 반환
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        username: cognitoUser.username,
        provider: userInfo.provider,
        isNew: cognitoUser.isNew,
        tokens: tokens, // Cognito 토큰 (있는 경우)
        userInfo: {
          id: userInfo.id,
          email: userInfo.email,
          name: userInfo.name,
          profileImage: userInfo.profileImage
        }
      })
    }
  } catch (error) {
    console.error('소셜 로그인 오류:', error)
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ 
        error: error.message,
        stack: error.stack
      })
    }
  }
}


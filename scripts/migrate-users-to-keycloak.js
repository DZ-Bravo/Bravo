/**
 * MongoDB → Keycloak 사용자 데이터 마이그레이션 스크립트
 * 
 * 사용법:
 *   node scripts/migrate-users-to-keycloak.js
 * 
 * 환경 변수:
 *   MONGODB_URI: MongoDB 연결 URI
 *   KEYCLOAK_URL: Keycloak 서버 URL (예: https://keycloak.hiker-cloud.site)
 *   KEYCLOAK_REALM: Keycloak Realm 이름 (예: hiking)
 *   KEYCLOAK_CLIENT_ID: Keycloak Client ID
 *   KEYCLOAK_CLIENT_SECRET: Keycloak Client Secret
 *   KEYCLOAK_ADMIN_USERNAME: Keycloak Admin 사용자명
 *   KEYCLOAK_ADMIN_PASSWORD: Keycloak Admin 비밀번호
 */

const { MongoClient } = require('mongodb');
const axios = require('axios');

// 환경 변수
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongodb.bravo-mongo-ns.svc.cluster.local:27017/hiking?replicaSet=rs0&readPreference=secondaryPreferred';
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'https://keycloak.hiker-cloud.site';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'hiking';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'hiking-client';
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || '';
const KEYCLOAK_ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin123';

let adminToken = null;

/**
 * Keycloak Admin 토큰 획득
 */
async function getAdminToken() {
  try {
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: KEYCLOAK_ADMIN_USERNAME,
        password: KEYCLOAK_ADMIN_PASSWORD,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    adminToken = response.data.access_token;
    console.log('✅ Keycloak Admin 토큰 획득 성공');
    return adminToken;
  } catch (error) {
    console.error('❌ Keycloak Admin 토큰 획득 실패:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Keycloak Realm 생성
 */
async function createRealm() {
  try {
    const realmData = {
      realm: KEYCLOAK_REALM,
      enabled: true,
      displayName: 'Hiking App',
      loginTheme: 'keycloak',
    };

    await axios.post(
      `${KEYCLOAK_URL}/admin/realms`,
      realmData,
      {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`✅ Realm "${KEYCLOAK_REALM}" 생성 성공`);
  } catch (error) {
    if (error.response?.status === 409) {
      console.log(`ℹ️  Realm "${KEYCLOAK_REALM}" 이미 존재함`);
    } else {
      console.error('❌ Realm 생성 실패:', error.response?.data || error.message);
      throw error;
    }
  }
}

/**
 * Keycloak Client 생성
 */
async function createClient() {
  try {
    const clientData = {
      clientId: KEYCLOAK_CLIENT_ID,
      enabled: true,
      clientAuthenticatorType: 'client-secret',
      secret: KEYCLOAK_CLIENT_SECRET,
      redirectUris: [
        'https://hiker-cloud.site/*',
        'https://hiker-cloud.site/auth/success',
        'https://hiker-cloud.site/api/auth/*',
      ],
      webOrigins: ['https://hiker-cloud.site'],
      standardFlowEnabled: true,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: true,
      serviceAccountsEnabled: true,
      publicClient: false,
    };

    await axios.post(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients`,
      clientData,
      {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`✅ Client "${KEYCLOAK_CLIENT_ID}" 생성 성공`);
  } catch (error) {
    if (error.response?.status === 409) {
      console.log(`ℹ️  Client "${KEYCLOAK_CLIENT_ID}" 이미 존재함`);
    } else {
      console.error('❌ Client 생성 실패:', error.response?.data || error.message);
      throw error;
    }
  }
}

/**
 * MongoDB에서 사용자 데이터 조회
 */
async function getUsersFromMongoDB() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    console.log('✅ MongoDB 연결 성공');

    const db = client.db('hiking');
    const users = await db.collection('users').find({}).toArray();
    console.log(`📊 MongoDB에서 ${users.length}명의 사용자 조회 완료`);

    return users;
  } catch (error) {
    console.error('❌ MongoDB 조회 실패:', error.message);
    throw error;
  } finally {
    await client.close();
  }
}

/**
 * Keycloak에 사용자 생성
 */
async function createUserInKeycloak(user) {
  try {
    const userData = {
      username: user.email || user.username,
      email: user.email,
      firstName: user.name || user.username,
      lastName: '',
      enabled: true,
      emailVerified: user.emailVerified || false,
      credentials: user.password ? [
        {
          type: 'password',
          value: user.password,
          temporary: false,
        },
      ] : [],
      attributes: {
        mongoId: [user._id.toString()],
        provider: user.provider ? [user.provider] : ['local'],
        providerId: user.providerId ? [user.providerId] : [],
      },
    };

    const response = await axios.post(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users`,
      userData,
      {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // 사용자 ID 추출
    const userId = response.headers.location.split('/').pop();
    console.log(`✅ 사용자 생성 성공: ${user.email || user.username} (ID: ${userId})`);

    return userId;
  } catch (error) {
    if (error.response?.status === 409) {
      console.log(`ℹ️  사용자 이미 존재: ${user.email || user.username}`);
      return null;
    } else {
      console.error(`❌ 사용자 생성 실패: ${user.email || user.username}`, error.response?.data || error.message);
      return null;
    }
  }
}

/**
 * 소셜 로그인 Identity Provider 설정 (카카오)
 */
async function setupKakaoIdentityProvider() {
  try {
    const idpData = {
      alias: 'kakao',
      providerId: 'oidc',
      enabled: true,
      config: {
        clientId: process.env.KAKAO_REST_API_KEY || '',
        clientSecret: process.env.KAKAO_CLIENT_SECRET || '',
        authorizationUrl: 'https://kauth.kakao.com/oauth/authorize',
        tokenUrl: 'https://kauth.kakao.com/oauth/token',
        userInfoUrl: 'https://kapi.kakao.com/v2/user/me',
        defaultScope: 'profile_nickname account_email',
        syncMode: 'IMPORT',
      },
    };

    await axios.post(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/identity-provider/instances`,
      idpData,
      {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('✅ 카카오 Identity Provider 설정 완료');
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('ℹ️  카카오 Identity Provider 이미 존재함');
    } else {
      console.error('❌ 카카오 Identity Provider 설정 실패:', error.response?.data || error.message);
    }
  }
}

/**
 * 소셜 로그인 Identity Provider 설정 (네이버)
 */
async function setupNaverIdentityProvider() {
  try {
    const idpData = {
      alias: 'naver',
      providerId: 'oidc',
      enabled: true,
      config: {
        clientId: process.env.NAVER_CLIENT_ID || '',
        clientSecret: process.env.NAVER_CLIENT_SECRET || '',
        authorizationUrl: 'https://nid.naver.com/oauth2.0/authorize',
        tokenUrl: 'https://nid.naver.com/oauth2.0/token',
        userInfoUrl: 'https://openapi.naver.com/v1/nid/me',
        defaultScope: 'name email',
        syncMode: 'IMPORT',
      },
    };

    await axios.post(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/identity-provider/instances`,
      idpData,
      {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('✅ 네이버 Identity Provider 설정 완료');
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('ℹ️  네이버 Identity Provider 이미 존재함');
    } else {
      console.error('❌ 네이버 Identity Provider 설정 실패:', error.response?.data || error.message);
    }
  }
}

/**
 * 메인 마이그레이션 함수
 */
async function migrate() {
  console.log('🚀 MongoDB → Keycloak 사용자 마이그레이션 시작\n');

  try {
    // 1. Keycloak Admin 토큰 획득
    await getAdminToken();

    // 2. Realm 생성
    await createRealm();

    // 3. Client 생성
    await createClient();

    // 4. Identity Provider 설정 (카카오, 네이버)
    await setupKakaoIdentityProvider();
    await setupNaverIdentityProvider();

    // 5. MongoDB에서 사용자 데이터 조회
    const users = await getUsersFromMongoDB();

    // 6. Keycloak에 사용자 생성
    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;

    for (const user of users) {
      const userId = await createUserInKeycloak(user);
      if (userId) {
        successCount++;
      } else if (userId === null) {
        skipCount++;
      } else {
        failCount++;
      }
    }

    console.log('\n📊 마이그레이션 결과:');
    console.log(`   ✅ 성공: ${successCount}명`);
    console.log(`   ⏭️  건너뜀: ${skipCount}명`);
    console.log(`   ❌ 실패: ${failCount}명`);
    console.log(`   📝 총계: ${users.length}명`);

    console.log('\n✅ 마이그레이션 완료!');
  } catch (error) {
    console.error('\n❌ 마이그레이션 실패:', error.message);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  migrate();
}

module.exports = { migrate };


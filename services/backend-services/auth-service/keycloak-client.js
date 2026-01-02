/**
 * Keycloak 클라이언트 유틸리티
 * Keycloak Admin API 및 Token 검증을 위한 헬퍼 함수
 */

import axios from 'axios';

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'https://keycloak.hiker-cloud.site';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'hiking';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'hiking-client';
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || '';

/**
 * Keycloak에서 Access Token 획득 (Client Credentials)
 */
export async function getClientToken() {
  try {
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: KEYCLOAK_CLIENT_ID,
        client_secret: KEYCLOAK_CLIENT_SECRET,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Keycloak Client Token 획득 실패:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Keycloak에서 사용자 로그인 (Resource Owner Password Credentials)
 */
export async function loginUser(username, password) {
  try {
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'password',
        client_id: KEYCLOAK_CLIENT_ID,
        client_secret: KEYCLOAK_CLIENT_SECRET,
        username: username,
        password: password,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Keycloak 사용자 로그인 실패:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Keycloak Access Token 검증
 */
export async function verifyToken(token) {
  try {
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token/introspect`,
      new URLSearchParams({
        token: token,
        client_id: KEYCLOAK_CLIENT_ID,
        client_secret: KEYCLOAK_CLIENT_SECRET,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Keycloak Token 검증 실패:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Keycloak에서 사용자 정보 조회
 */
export async function getUserInfo(accessToken) {
  try {
    const response = await axios.get(
      `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Keycloak 사용자 정보 조회 실패:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Keycloak에 사용자 생성 (Admin API)
 */
export async function createUser(adminToken, userData) {
  try {
    const response = await axios.post(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users`,
      {
        username: userData.username,
        email: userData.email,
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        enabled: true,
        emailVerified: false,
        credentials: [
          {
            type: 'password',
            value: userData.password,
            temporary: false,
          },
        ],
        attributes: userData.attributes || {},
      },
      {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.headers.location.split('/').pop(); // 사용자 ID 반환
  } catch (error) {
    console.error('Keycloak 사용자 생성 실패:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Keycloak Admin 토큰 획득
 */
export async function getAdminToken() {
  try {
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
        password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin123',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Keycloak Admin Token 획득 실패:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Keycloak에서 사용자 조회 (Admin API)
 */
export async function getUserByUsername(adminToken, username) {
  try {
    const response = await axios.get(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users`,
      {
        params: {
          username: username,
          exact: true,
        },
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
      }
    );
    return response.data.length > 0 ? response.data[0] : null;
  } catch (error) {
    console.error('Keycloak 사용자 조회 실패:', error.response?.data || error.message);
    throw error;
  }
}


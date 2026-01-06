# 배포 가이드

## 현재 상황

1. **코드 변경사항**: 회원가입 페이지에 5분 타이머 추가 및 이메일 전송 오류 처리 개선
2. **배포 필요**: 프론트엔드 서비스 배포 필요
3. **AWS SES DKIM 문제**: 별도로 DNS 레코드 복구 필요 (DKIM_FIX_GUIDE.md 참고)

## 배포 방법

### 방법 1: GitLab CI/CD 파이프라인 사용 (권장)

1. **코드 커밋 및 푸시**
   ```bash
   git add services/frontend-service/src/pages/Signup.jsx
   git commit -m "feat: 회원가입 이메일 인증 5분 타이머 추가 및 오류 처리 개선"
   git push origin main
   ```

2. **GitLab 파이프라인 확인**
   - GitLab 프로젝트 → CI/CD → Pipelines
   - `build-frontend` 작업 완료 대기
   - `deploy-frontend` 작업에서 **수동 승인 버튼 클릭**

3. **배포 확인**
   - 배포 완료 후 https://hiker-cloud.site/signup 접속
   - 이메일 인증 시 타이머가 표시되는지 확인

### 방법 2: 수동 배포 스크립트 사용

```bash
# 프론트엔드 수동 배포
cd /home/bravo/LABs
./manual-deploy-frontend.sh
```

**주의**: 수동 배포 스크립트는 로컬에서 빌드하고 배포하므로, GitLab CI/CD를 사용하는 것이 권장됩니다.

### 방법 3: kubectl 직접 사용

```bash
# EKS 클러스터 연결
aws eks update-kubeconfig --region ap-northeast-2 --name bravo-eks

# 현재 이미지 확인
kubectl get deployment frontend -n bravo-front-ns -o jsonpath='{.spec.template.spec.containers[0].image}'

# 새 이미지로 업데이트 (GitLab CI/CD에서 빌드된 이미지 사용)
kubectl set image deployment/frontend \
  frontend=940482451773.dkr.ecr.ap-northeast-2.amazonaws.com/bravo/hiking-frontend:2.XX \
  -n bravo-front-ns

# 배포 상태 확인
kubectl rollout status deployment/frontend -n bravo-front-ns
```

## 배포 전 확인사항

1. **코드 변경사항 확인**
   - `services/frontend-service/src/pages/Signup.jsx`에 타이머 기능 추가됨
   - `services/backend-services/auth-service/auth.js`에 오류 처리 개선됨

2. **백엔드 서비스도 배포 필요**
   - 이메일 전송 오류 처리 개선이 백엔드에도 적용됨
   - `auth-service`도 함께 배포 필요

## 배포 후 확인

1. **회원가입 페이지 접속**
   - https://hiker-cloud.site/signup

2. **이메일 인증 타이머 확인**
   - 이메일 입력 후 "인증" 버튼 클릭
   - 인증번호 입력 필드에 **5분 타이머 (MM:SS 형식)** 표시 확인
   - 타이머가 60초 미만일 때 빨간색으로 표시되는지 확인

3. **이메일 전송 오류 처리 확인**
   - DKIM 문제로 이메일 전송 실패 시 명확한 오류 메시지 표시 확인
   - 개발 모드에서는 인증번호가 표시되는지 확인

## AWS SES DKIM 문제 해결

**중요**: 코드 배포와 별도로 AWS SES에서 DKIM DNS 레코드를 복구해야 합니다.

자세한 내용은 `DKIM_FIX_GUIDE.md` 파일을 참고하세요.

### 빠른 요약

1. AWS SES 콘솔 접속 (ap-northeast-2 리전)
2. Verified identities → `hiker-cloud.site` 선택
3. DKIM 탭에서 3개의 CNAME 레코드 확인
4. DNS 관리 콘솔에서 3개의 CNAME 레코드 추가
5. DNS 전파 대기 (5분 ~ 24시간)
6. AWS SES에서 자동으로 DKIM 재활성화 확인

## 트러블슈팅

### 배포 후 타이머가 표시되지 않는 경우

1. 브라우저 캐시 삭제 (Ctrl+Shift+R 또는 Cmd+Shift+R)
2. 배포 상태 확인: `kubectl get pods -n bravo-front-ns`
3. 프론트엔드 로그 확인: `kubectl logs -n bravo-front-ns -l app=frontend`

### 이메일이 여전히 전송되지 않는 경우

1. AWS SES DKIM 설정 확인 (DKIM_FIX_GUIDE.md 참고)
2. 백엔드 로그 확인: `kubectl logs -n bravo-core-ns -l app=auth-service`
3. SES 전송 오류 메시지 확인


# PodSecurity Admission 설정

본 디렉토리는 Kubernetes PodSecurity Admission 설정을 관리한다.

## 적용 범위
- Namespace 단위 PodSecurity Level 설정
- Pod 단위 보안 정책은 Kyverno에서 별도 관리

## 적용 순서
1. Namespace 라벨 적용 (01-namespaces.yaml)
2. warn / audit 로그 확인
3. Pod 재시작으로 enforce 반영
4. Kyverno 도입 후 Pod 단위 정책 적용

## 주의사항
- PodSecurity는 Pod 생성 시점에만 적용됨
- 기존 Pod는 재시작해야 정책 적용됨

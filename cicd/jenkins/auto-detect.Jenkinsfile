pipeline {
  agent {
    kubernetes {
      label 'bravo-auto-ci'
      defaultContainer 'jnlp'
      yaml """
apiVersion: v1
kind: Pod
spec:
  serviceAccountName: jenkins
  containers:
  - name: jnlp
    volumeMounts:
    - name: common-workspace
      mountPath: /home/jenkins/agent
  - name: kaniko
    image: gcr.io/kaniko-project/executor:debug
    command: ["sleep", "infinity"]
    env:
    - name: DOCKER_CONFIG
      value: /kaniko/.docker  # 인증 정보를 찾을 디렉토리 지정
    volumeMounts:
    - name: docker-config
      mountPath: /kaniko/.docker
    - name: common-workspace
      mountPath: /home/jenkins/agent
  - name: trivy
    image: aquasec/trivy:0.49.1
    command: ["sleep", "infinity"]
    volumeMounts:
    - name: common-workspace
      mountPath: /home/jenkins/agent
    - name: trivy-cache
      mountPath: /root/.cache
  - name: sonar
    image: sonarsource/sonar-scanner-cli:5.0
    command: ["sleep", "infinity"]
    volumeMounts:
    - name: common-workspace
      mountPath: /home/jenkins/agent
  volumes:
  - name: docker-config
    secret:
      secretName: harbor-regcred
      items:
      - key: .dockerconfigjson
        path: config.json        # 파일명을 config.json으로 고정
  - name: common-workspace
    emptyDir: {}
  - name: trivy-cache
    emptyDir: {}
"""
    }
  }

  // ... (environment 및 stages 로직은 그대로 유지)

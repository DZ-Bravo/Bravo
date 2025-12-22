pipeline {
  agent {
    kubernetes {
      label 'bravo-backend-ci'
      podRetention onFailure()

      yaml """
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: kaniko
    image: gcr.io/kaniko-project/executor:debug
    command: ["/busybox/sleep"]
    args: ["infinity"]
    volumeMounts:
      - name: workspace-volume
        mountPath: /home/jenkins/agent
      - name: harbor-regcred
        mountPath: /kaniko/.docker

  - name: sonar
    image: sonarsource/sonar-scanner-cli:5.0
    command: ["sleep"]
    args: ["infinity"]
    volumeMounts:
      - name: workspace-volume
        mountPath: /home/jenkins/agent

  - name: trivy
    image: aquasec/trivy:0.51.1
    command: ["sleep"]
    args: ["infinity"]
    volumeMounts:
      - name: workspace-volume
        mountPath: /home/jenkins/agent

  - name: jnlp
    image: jenkins/inbound-agent:3345.v03dee9b_f88fc-1
    resources:
      requests:
        cpu: "100m"
        memory: "256Mi"

  volumes:
  - name: workspace-volume
    emptyDir: {}
  - name: harbor-regcred
    secret:
      secretName: harbor-regcred
      items:
        - key: .dockerconfigjson
          path: config.json
"""
    }
  }

  environment {
    // ===== 공통 설정 =====
    GIT_REPO   = 'https://github.com/DZ-Bravo/Bravo.git'
    GIT_BRANCH = 'main'

    // ===== 서비스 설정 (여기만 바꾸면 됨) =====
    SERVICE_NAME = 'auth-service'
    SERVICE_PATH = 'services/backend-services/auth-service'

    // ===== 이미지 설정 =====
    REGISTRY   = '192.168.0.244:30305'
    IMAGE_NAME = "bravo/${SERVICE_NAME}"
    IMAGE_TAG  = "${BUILD_NUMBER}"

    // ===== Sonar =====
    SONAR_PROJECT_KEY = "${SERVICE_NAME}"
  }

  stages {

    stage('Checkout') {
      steps {
        git branch: "${GIT_BRANCH}",
            url: "${GIT_REPO}",
            credentialsId: 'github-pat'
      }
    }

    stage('SonarQube Analysis') {
      steps {
        container('sonar') {
          withSonarQubeEnv('sonarqube') {
            sh """
              sonar-scanner \
                -Dsonar.projectKey=${SONAR_PROJECT_KEY} \
                -Dsonar.sources=${SERVICE_PATH}
            """
          }
        }
      }
    }

    stage('Quality Gate') {
      steps {
        timeout(time: 15, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Build & Push (Kaniko)') {
      steps {
        container('kaniko') {
          sh """
            echo '=== CI build context preparation ==='
            cd /home/jenkins/agent/workspace/bravo\\ ci

            # Dockerfile이 기대하는 구조를 CI에서 보정
            rm -rf backend-services shared
            mkdir -p backend-services shared

            cp -r ${SERVICE_PATH} backend-services/${SERVICE_NAME}

            echo '=== Kaniko build start ==='
            /kaniko/executor \
              --dockerfile=${SERVICE_PATH}/Dockerfile \
              --context=/home/jenkins/agent/workspace/bravo\\ ci \
              --destination=${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG} \
              --cache=true \
              --cache-repo=${REGISTRY}/bravo/kaniko-cache \
              --ski

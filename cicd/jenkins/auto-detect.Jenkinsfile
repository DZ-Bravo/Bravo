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
  - name: kaniko
    image: gcr.io/kaniko-project/executor:debug
    command: ["sleep"]
    args: ["infinity"]
    volumeMounts:
      - name: workspace-volume
        mountPath: /home/jenkins/agent
      - name: docker-config
        mountPath: /kaniko/.docker

  - name: trivy
    image: aquasec/trivy:0.49.1
    command: ["sleep"]
    args: ["infinity"]
    volumeMounts:
      - name: trivy-cache
        mountPath: /root/.cache
      - name: workspace-volume
        mountPath: /home/jenkins/agent

  - name: sonar-scanner
    image: sonarsource/sonar-scanner-cli:5.0
    command: ["sleep"]
    args: ["infinity"]
    volumeMounts:
      - name: workspace-volume
        mountPath: /home/jenkins/agent

  - name: jnlp
    image: jenkins/inbound-agent:3345.v03dee9b_f88fc-1
    volumeMounts:
      - name: workspace-volume
        mountPath: /home/jenkins/agent

  volumes:
    - name: workspace-volume
      emptyDir: {}
    - name: docker-config
      emptyDir: {}
    - name: trivy-cache
      emptyDir: {}
"""
    }
  }

  options {
    skipDefaultCheckout()
  }

  environment {
    REGISTRY   = "192.168.0.244:30443"
    PROJECT    = "bravo"
    IMAGE_NAME = "hiking-frontend"
    FRONT_DIR  = "services/frontend-service"
    SONAR_HOST = "http://sonarqube.bravo-platform-ns.svc.cluster.local:9000"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Prepare Image Tag') {
      steps {
        container('jnlp') {
          script {
            def gitCommit = sh(
              script: "git rev-parse --short HEAD",
              returnStdout: true
            ).trim()

            env.IMAGE_TAG = "${env.BUILD_NUMBER}-${gitCommit}"
            echo "IMAGE_TAG = ${env.IMAGE_TAG}"
          }
        }
      }
    }

    stage('SonarQube Scan') {
      steps {
        container('sonar-scanner') {
          withCredentials([string(credentialsId: 'sonarqube-token', variable: 'SONAR_TOKEN')]) {
            sh '''
              set -e

              sonar-scanner \
                -Dsonar.host.url=${SONAR_HOST} \
                -Dsonar.login=${SONAR_TOKEN} \
                -Dsonar.projectKey=${PROJECT}-${IMAGE_NAME} \
                -Dsonar.projectName=${PROJECT}-${IMAGE_NAME} \
                -Dsonar.projectVersion=${IMAGE_TAG} \
                -Dsonar.projectBaseDir=${WORKSPACE}/${FRONT_DIR} \
                -Dsonar.sources=.
            '''
          }
        }
      }
    }

    stage('Build & Push Image (Kaniko)') {
      steps {
        container('kaniko') {
          withCredentials([usernamePassword(
            credentialsId: 'jenkins',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )]) {

            sh '''
              set -e

              mkdir -p /kaniko/.docker

              cat <<EOF > /kaniko/.docker/config.json
              {
                "auths": {
                  "${REGISTRY}": {
                    "username": "${HARBOR_USER}",
                    "password": "${HARBOR_PASS}"
                  }
                }
              }
              EOF

              /kaniko/executor \
                --dockerfile=${WORKSPACE}/${FRONT_DIR}/Dockerfile \
                --context=${WORKSPACE}/${FRONT_DIR} \
                --destination=${REGISTRY}/${PROJECT}/${IMAGE_NAME}:${IMAGE_TAG} \
                --cache=true \
                --cache-repo=${REGISTRY}/${PROJECT}/kaniko-cache \
                --skip-tls-verify
            '''
          }
        }
      }
    }

    stage('Trivy Scan') {
      steps {
        container('trivy') {
          withCredentials([usernamePassword(
            credentialsId: 'jenkins',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )]) {

            sh '''
              set -e
              IMAGE=${REGISTRY}/${PROJECT}/${IMAGE_NAME}:${IMAGE_TAG}

              trivy image \
                --cache-dir /root/.cache \
                --severity HIGH,CRITICAL \
                --exit-code 1 \
                --no-progress \
                --username "${HARBOR_USER}" \
                --password "${HARBOR_PASS}" \
                --insecure \
                ${IMAGE}
            '''
          }
        }
      }
    }
  }

  post {
    always {
      echo "✅ Pipeline finished: ${currentBuild.currentResult}"
      echo "Image: ${REGISTRY}/${PROJECT}/${IMAGE_NAME}:${IMAGE_TAG}"
    }
    failure {
      echo "❌ Pipeline failed"
    }
  }
}


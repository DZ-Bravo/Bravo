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
    command: ["/busybox/sleep"]
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

  - name: jnlp
    image: jenkins/inbound-agent:3345.v03dee9b_f88fc-1

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
    IMAGE_TAG  = "${env.BUILD_NUMBER}-${env.GIT_COMMIT.take(7)}"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build & Scan') {
      steps {
        wrap([$class: 'AnsiColorBuildWrapper', colorMapName: 'xterm']) {
          timestamps {
            container('kaniko') {
              withCredentials([usernamePassword(
                credentialsId: 'jenkins',
                usernameVariable: 'HARBOR_USER',
                passwordVariable: 'HARBOR_PASS'
              )]) {

                sh '''
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

                  echo "🚀 Building Image: ${REGISTRY}/${PROJECT}/${IMAGE_NAME}:${IMAGE_TAG}"

                  /kaniko/executor \
                    --dockerfile=${WORKSPACE}/services/frontend-service/Dockerfile \
                    --context=${WORKSPACE}/services/frontend-service \
                    --destination=${REGISTRY}/${PROJECT}/${IMAGE_NAME}:${IMAGE_TAG} \
                    --cache=true \
                    --cache-repo=${REGISTRY}/${PROJECT}/kaniko-cache \
                    --skip-tls-verify
                '''
              }
            }

            container('trivy') {
              sh '''
                IMAGE=${REGISTRY}/${PROJECT}/${IMAGE_NAME}:${IMAGE_TAG}

                echo "🔍 Trivy scanning ${IMAGE}"

                trivy image \
                  --cache-dir /root/.cache \
                  --severity HIGH,CRITICAL \
                  --exit-code 1 \
                  --no-progress \
                  ${IMAGE}
              '''
            }
          }
        }
      }
    }
  }

  post {
    always {
      echo "✅ Pipeline finished: ${currentBuild.currentResult}"
    }
    failure {
      echo "❌ Build failed. Check logs above."
    }
  }
}


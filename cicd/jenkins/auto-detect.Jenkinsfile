pipeline {
  agent {
    kubernetes {
      label 'bravo-auto-ci'
      defaultContainer 'jnlp'
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
      - name: docker-config
        mountPath: /kaniko/.docker

  - name: trivy
    image: aquasec/trivy:0.49.1
    command: ["sleep"]
    args: ["infinity"]

  - name: jnlp
    image: jenkins/inbound-agent:3345.v03dee9b_f88fc-1

  volumes:
    - name: workspace-volume
      emptyDir: {}
    - name: docker-config
      emptyDir: {}
"""
    }
  }

  environment {
    REGISTRY   = "192.168.0.244:30443"
    PROJECT    = "bravo"
    IMAGE_NAME = "hiking-frontend"
    IMAGE_TAG  = "build-${env.BUILD_NUMBER}"
  }

  stages {

    stage('Checkout') {
      steps {
        container('jnlp') {
          checkout scm
        }
      }
    }

    stage('Build & Push Image') {
      steps {
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

              echo "🚀 Building & Pushing Image: ${REGISTRY}/${PROJECT}/${IMAGE_NAME}:${IMAGE_TAG}"

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
      }
    }

    stage('Trivy Scan') {
      steps {
        container('trivy') {
          sh '''
            IMAGE=${REGISTRY}/${PROJECT}/${IMAGE_NAME}:${IMAGE_TAG}
            echo "🔍 Trivy scanning ${IMAGE}"

            trivy image \
              --skip-db-update \
              --severity HIGH,CRITICAL \
              --exit-code 1 \
              --no-progress \
              ${IMAGE}
          '''
        }
      }
    }
  }

  post {
    success {
      echo "✅ Image build & scan success"
    }
    failure {
      echo "❌ Build or scan failed"
    }
  }
}


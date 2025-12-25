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
    REGISTRY   = "harbor-registry.bravo-platform-ns.svc.cluster.local:5000"
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

              echo "🚀 Pushing image to ${REGISTRY}/bravo/hiking-frontend:${IMAGE_TAG}"

              /kaniko/executor \
                --dockerfile=${WORKSPACE}/services/frontend-service/Dockerfile \
                --context=${WORKSPACE}/services/frontend-service \
                --destination=${REGISTRY}/bravo/hiking-frontend:${IMAGE_TAG} \
                --cache=true \
                --cache-repo=${REGISTRY}/bravo/kaniko-cache \
                --skip-tls-verify
            '''
          }
        }
      }
    }
  }

  post {
    success {
      echo "✅ Image pushed successfully to Harbor"
    }
    failure {
      echo "❌ Image build or push failed"
    }
  }
}


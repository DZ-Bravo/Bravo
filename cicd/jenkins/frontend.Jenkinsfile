pipeline {
  agent {
    kubernetes {
      label 'bravo-frontend-ci'
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
        mountPath: /workspace
      - name: harbor-regcred
        mountPath: /kaniko/.docker

  - name: trivy
    image: aquasec/trivy:0.51.1
    command: ["sleep"]
    args: ["infinity"]
    volumeMounts:
      - name: workspace-volume
        mountPath: /workspace

  - name: jnlp
    image: jenkins/inbound-agent:3345.v03dee9b_f88fc-1

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
    SERVICE_NAME = "hiking-frontend"
    IMAGE_NAME   = "bravo/frontend-service"
    REGISTRY     = "192.168.0.244:30305"
    IMAGE_TAG    = "${BUILD_NUMBER}"
  }

  stages {

    stage('Checkout') {
      steps {
        git branch: 'main',
            url: 'https://github.com/DZ-Bravo/Bravo.git',
            credentialsId: 'github-pat'
      }
    }

    stage('Build & Push (Kaniko)') {
      steps {
        container('kaniko') {
          sh """
            echo '=== Jenkins Workspace ==='
            echo "WORKSPACE=\$WORKSPACE"
            cd "\$WORKSPACE"

            echo '--- repo root ---'
            pwd
            ls -al

            echo '--- frontend-service ---'
            ls -al services/frontend-service

            /kaniko/executor \
              --dockerfile=Dockerfile \
              --context="$WORKSPACE/services/frontend-service" \
              --destination=${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG} \
              --cache=true \
              --cache-repo=${REGISTRY}/bravo/kaniko-cache \
              --skip-tls-verify
          """
        }
      }
    }

    stage('Trivy Image Scan (CRITICAL only)') {
      steps {
        container('trivy') {
          sh """
            trivy image \
              --scanners vuln \
              --severity CRITICAL \
              --exit-code 1 \
              --no-progress \
              ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}
          """
        }
      }
    }
  }
}

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
    REGISTRY  = "192.168.0.244:30305"
    IMAGE_TAG = "${BUILD_NUMBER}"
  }

  triggers {
    githubPush()
  }

  stages {

    stage('Checkout') {
      steps {
        git branch: 'main',
            url: 'https://github.com/DZ-Bravo/Bravo.git',
            credentialsId: 'github-pat'
      }
    }

    stage('Detect Changed Backend Services') {
      steps {
        script {
          def services = sh(
            script: '''
              git diff --name-only HEAD~1 HEAD \
              | grep '^services/backend-services/' \
              | cut -d'/' -f3 \
              | sort -u
            ''',
            returnStdout: true
          ).trim()

          if (!services) {
            echo 'No backend service changes detected. CI 종료.'
            currentBuild.result = 'SUCCESS'
            env.CHANGED_SERVICES = ''
          } else {
            env.CHANGED_SERVICES = services
            echo "Changed backend services:\\n${services}"
          }
        }
      }
    }

    stage('Build & Push Changed Services') {
      when {
        expression { env.CHANGED_SERVICES }
      }
      steps {
        container('kaniko') {
          script {
            env.CHANGED_SERVICES.split('\n').each { svc ->
              echo "=== Building backend service: ${svc} ==="

              sh """
                /kaniko/executor \
                  --dockerfile=Dockerfile \
                  --context=\$WORKSPACE/services/backend-services/${svc} \
                  --destination=${REGISTRY}/bravo/${svc}:${IMAGE_TAG} \
                  --cache=true \
                  --cache-repo=${REGISTRY}/bravo/kaniko-cache \
                  --skip-tls-verify
              """
            }
          }
        }
      }
    }

    stage('Trivy Scan (CRITICAL only)') {
      when {
        expression { env.CHANGED_SERVICES }
      }
      steps {
        container('trivy') {
          script {
            env.CHANGED_SERVICES.split('\n').each { svc ->
              echo "=== Trivy scan: ${svc} ==="

              sh """
                trivy image \
                  --scanners vuln \
                  --severity CRITICAL \
                  --exit-code 1 \
                  --no-progress \
                  ${REGISTRY}/bravo/${svc}:${IMAGE_TAG}
              """
            }
          }
        }
      }
    }
  }
}

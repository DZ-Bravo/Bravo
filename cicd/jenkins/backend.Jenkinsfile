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

  parameters {
    string(
      name: 'SERVICE_NAME', 
      defaultValue: 'hiking-auth-service',
      description: '예: hiking-auth-service')
  }

  environment {
    REGISTRY   = "192.168.0.244:30305"
    IMAGE_NAME = "bravo/${params.SERVICE_NAME}"
    IMAGE_TAG  = "${BUILD_NUMBER}"
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
            echo '=== Backend CI ==='
            echo "SERVICE_NAME=${params.SERVICE_NAME}"
            echo "WORKSPACE=\$WORKSPACE"

            cd "\$WORKSPACE"

            echo '--- service dir ---'
            ls -al services/backend-services/${params.SERVICE_NAME}
            --context="$WORKSPACE/services/backend-services/${params.SERVICE_NAME}"

            /kaniko/executor \
              --dockerfile=Dockerfile \
              --context="\$WORKSPACE/services/${params.SERVICE_NAME}" \
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

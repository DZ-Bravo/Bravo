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
        mountPath: /workspace
      - name: harbor-regcred
        mountPath: /kaniko/.docker

  - name: trivy
    image: aquasec/trivy:0.51.1
    command: ["sleep"]
    args: ["infinity"]

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

  options {
    skipDefaultCheckout(true)
  }

  environment {
    REGISTRY   = "192.168.0.244:30305"
    CACHE_REPO = "192.168.0.244:30305/bravo/kaniko-cache"
    SEVERITY   = "CRITICAL"
  }

  stages {

    /* ===========================
       1. Checkout
       =========================== */
    stage('Checkout') {
      steps {
        container('jnlp') {
          checkout([
            $class: 'GitSCM',
            branches: [[name: '*/main']],
            userRemoteConfigs: [[
              url: 'https://github.com/DZ-Bravo/Bravo.git',
              credentialsId: 'github-pat'
            ]]
          ])
        }
      }
    }

    /* ===========================
       2. Detect Changed Services
       =========================== */
    stage('Detect Changed Services') {
      steps {
        container('jnlp') {
          sh '''
            git fetch origin main

            BASE_COMMIT=${GIT_PREVIOUS_SUCCESSFUL_COMMIT:-origin/main~1}
            echo "🔍 Diff base: $BASE_COMMIT -> $GIT_COMMIT"

            git diff --name-only $BASE_COMMIT $GIT_COMMIT > changed_files.txt || true
            cat changed_files.txt || true

            > changed_services.txt

            while read file; do
              # Backend services
              if [[ "$file" =~ ^services/backend-services/([^/]+)/ ]]; then
                svc="${BASH_REMATCH[1]}"
                echo "backend-services/$svc" >> changed_services.txt
              fi

              # Frontend
              if [[ "$file" =~ ^services/hiking-frontend/ ]]; then
                echo "hiking-frontend" >> changed_services.txt
              fi
            done < changed_files.txt

            sort -u changed_services.txt -o changed_services.txt
            echo "📦 Changed services:"
            cat changed_services.txt || true
          '''
        }
      }
    }

    /* ===========================
       3. Build Images (Kaniko)
       =========================== */
    stage('Build Images') {
      when {
        expression { fileExists('changed_services.txt') && readFile('changed_services.txt').trim() }
      }
      steps {
        container('kaniko') {
          script {
            def services = readFile('changed_services.txt').trim().split('\n')

            for (svc in services) {
              def svcName = svc.split('/').last()
              def contextPath = "/workspace/services/${svc}"

              sh """
                echo "🚀 Building ${svcName}"
                /kaniko/executor \
                  --dockerfile=${contextPath}/Dockerfile \
                  --context=${contextPath} \
                  --destination=${REGISTRY}/bravo/${svcName}:${BUILD_NUMBER} \
                  --cache=true \
                  --cache-repo=${CACHE_REPO} \
                  --skip-tls-verify
              """
            }
          }
        }
      }
    }

    /* ===========================
       4. Trivy Gate (CRITICAL)
       =========================== */
    stage('Trivy Image Scan') {
      when {
        expression { fileExists('changed_services.txt') && readFile('changed_services.txt').trim() }
      }
      steps {
        container('trivy') {
          script {
            def services = readFile('changed_services.txt').trim().split('\n')

            for (svc in services) {
              def svcName = svc.split('/').last()
              sh """
                echo "🔍 Trivy scan: ${svcName}"
                trivy image \
                  --severity ${SEVERITY} \
                  --scanners vuln \
                  --exit-code 1 \
                  --no-progress \
                  ${REGISTRY}/bravo/${svcName}:${BUILD_NUMBER}
              """
            }
          }
        }
      }
    }
  }
}

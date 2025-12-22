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
            git fetch origin main --depth=2

            CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD || true)
            SERVICES=()

            for file in $CHANGED_FILES; do
              if [[ "$file" == services/backend-services/* ]]; then
                svc=$(echo $file | cut -d/ -f3)
                SERVICES+=("backend-services/$svc")
              fi

              if [[ "$file" == services/hiking-frontend/* ]]; then
                SERVICES+=("hiking-frontend")
              fi
            done

            printf "%s\n" "${SERVICES[@]}" | sort -u > changed_services.txt
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
        expression { fileExists('changed_services.txt') }
      }
      steps {
        container('kaniko') {
          script {
            def services = readFile('changed_services.txt').trim().split('\n')

            for (svc in services) {
              if (!svc?.trim()) continue
              def svcName = svc.split('/').last()

              sh """
                /kaniko/executor \
                  --dockerfile=Dockerfile \
                  --context=/workspace/services/${svc} \
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
        expression { fileExists('changed_services.txt') }
      }
      steps {
        container('trivy') {
          script {
            def services = readFile('changed_services.txt').trim().split('\n')

            for (svc in services) {
              if (!svc?.trim()) continue
              def svcName = svc.split('/').last()

              echo "🔍 Trivy scan: ${svcName}"

              sh """
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

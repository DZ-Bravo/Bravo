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
      - name: harbor-regcred
        mountPath: /kaniko/.docker

  - name: trivy
    image: aquasec/trivy:0.51.1
    command: ["sleep"]
    args: ["infinity"]
    volumeMounts:
      - name: workspace-volume
        mountPath: /home/jenkins/agent
      - name: harbor-regcred
        mountPath: /root/.docker

  - name: jnlp
    image: jenkins/inbound-agent:3345.v03dee9b_f88fc-1
    resources:
      requests:
        memory: "256Mi"
        cpu: "100m"

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

    stage('Detect Changed Services') {
      steps {
        container('jnlp') {
          sh '''
set -e

git fetch origin main

BASE_COMMIT=$(git rev-parse HEAD~1 2>/dev/null || echo "")
echo "Diff base: $BASE_COMMIT -> HEAD"

if [ -n "$BASE_COMMIT" ]; then
  git diff --name-only "$BASE_COMMIT" HEAD > changed_files.txt
else
  git diff --name-only HEAD > changed_files.txt
fi

cat changed_files.txt || true

> changed_services.txt

while read file; do
  case "$file" in
    services/backend-services/*/.ci-trigger)
      svc=$(echo "$file" | cut -d/ -f3)
      echo "backend-services/$svc" >> changed_services.txt
      ;;
    services/backend-services/*/*)
      svc=$(echo "$file" | cut -d/ -f3)
      echo "backend-services/$svc" >> changed_services.txt
      ;;
    services/hiking-frontend/*/.ci-trigger)
      echo "hiking-frontend" >> changed_services.txt
      ;;
    services/hiking-frontend/*)
      echo "hiking-frontend" >> changed_services.txt
      ;;
  esac
done < changed_files.txt

sort -u changed_services.txt -o changed_services.txt

if [ ! -s changed_services.txt ]; then
  echo "No affected services detected. CI will be skipped."
  touch .ci_skip
else
  echo "Changed services:"
  cat changed_services.txt
fi
'''
        }
      }
    }

    stage('Build Images') {
      when {
        expression { !fileExists('.ci_skip') }
      }
      steps {
        container('kaniko') {
          script {
            def services = readFile('changed_services.txt').trim().split('\n')

            for (svc in services) {
              if (!svc?.trim()) {
                continue
              }

              def imageName = ""
              def dockerfilePath = ""
              def contextPath = "${env.WORKSPACE}/services"

              if (svc.startsWith("backend-services/")) {
                def svcName = svc.split('/').last()
                imageName = "hiking-${svcName}"
                dockerfilePath = "${contextPath}/backend-services/${svcName}/Dockerfile"
              }
              else if (svc == "frontend-service" || svc == "hiking-frontend") {
                imageName = "hiking-frontend"
                dockerfilePath = "${contextPath}/frontend-service/Dockerfile"
              }
              else {
                error("Unknown service type: ${svc}")
              }

              sh """
                echo "Building image: ${imageName}"
                /kaniko/executor \
                  --dockerfile=${dockerfilePath} \
                  --context=${contextPath} \
                  --destination=${REGISTRY}/bravo/${imageName}:${BUILD_NUMBER} \
                  --cache=true \
                  --cache-repo=${CACHE_REPO} \
                  --skip-tls-verify
              """
            }
          }
        }
      }
    }

    stage('Trivy Image Scan') {
      when {
        expression { !fileExists('.ci_skip') }
      }
      steps {
        container('trivy') {
          script {
            def services = readFile('changed_services.txt').trim().split('\n')

            for (svc in services) {
              if (!svc?.trim()) {
                continue
              }

              def imageName = ""

              if (svc.startsWith("backend-services/")) {
                def svcName = svc.split('/').last()
                imageName = "hiking-${svcName}"
              }
              else if (svc == "frontend-service" || svc == "hiking-frontend") {
                imageName = "hiking-frontend"
              }
              else {
                error("Unknown service type: ${svc}")
              }

              sh """
                echo "Trivy scan: ${imageName}"
                trivy image \
                  --severity ${SEVERITY} \
                  --scanners vuln \
                  --exit-code 1 \
                  --no-progress \
                  ${REGISTRY}/bravo/${imageName}:${BUILD_NUMBER}
              """
            }
          }
        }
      }
    }

  } // <-- stages 닫힘

  post {
    always {
      echo "CI finished"
    }
    success {
      echo "CI succeeded"
    }
    aborted {
      echo "CI skipped (no relevant changes)"
    }
  }

} // <-- pipeline 닫힘

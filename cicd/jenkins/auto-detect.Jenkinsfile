pipeline {
  agent {
    kubernetes {
      label 'bravo-auto-ci'
      defaultContainer 'jnlp'
    }
  }

  environment {
    REGISTRY = "192.168.0.244:30443"
    PROJECT  = "bravo"
    SONAR_HOST_URL = "http://sonarqube.bravo-platform-ns.svc.cluster.local:9000"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    /************************************************************
     * 🔍 Detect Changed Services (FIXED VERSION)
     ************************************************************/
    stage('Detect Changed Services') {
      steps {
        script {
          def base = env.GIT_PREVIOUS_SUCCESSFUL_COMMIT
          def head = env.GIT_COMMIT

          if (!base) {
            echo "⚠️ First build detected. Using HEAD~1"
            base = "HEAD~1"
          }

          echo "🔍 Diff base: ${base}"
          echo "🔍 Diff head: ${head}"

          sh """
            git diff --name-only ${base} ${head} > changed_files.txt
            echo "===== CHANGED FILES ====="
            cat changed_files.txt || true
          """

          def services = []

          readFile("changed_files.txt")
            .split("\\n")
            .each { file ->
              if (file.startsWith("frontend-service/")) {
                services << "frontend-service"
              }
              if (file.startsWith("backend-services/")) {
                def svc = file.split("/")[1]
                services << "backend-services/${svc}"
              }
            }

          services = services.unique()

          if (services.isEmpty()) {
            echo "⚠️ 변경된 서비스 없음 → CI 종료"
            currentBuild.result = "SUCCESS"
            return
          }

          writeFile file: "services.txt", text: services.join("\n")

          echo "✅ 변경된 서비스 목록:"
          sh "cat services.txt"
        }
      }
    }

    /************************************************************
     * 🚀 Build & Scan
     ************************************************************/
    stage('Build & Scan Services') {
      when {
        expression { fileExists('services.txt') }
      }
      steps {
        script {
          def services = readFile("services.txt").split("\n")

          for (svc in services) {
            echo "🚀 Building ${svc}"

            def imageName = svc.replace("backend-services/", "").replace("frontend-service", "hiking-frontend")
            def imageTag  = "${env.BUILD_NUMBER}-${env.GIT_COMMIT.take(7)}"

            container('kaniko') {
              sh """
              /kaniko/executor \
                --dockerfile=\${WORKSPACE}/${svc}/Dockerfile \
                --context=\${WORKSPACE}/${svc} \
                --destination=${REGISTRY}/${PROJECT}/${imageName}:${imageTag} \
                --destination=${REGISTRY}/${PROJECT}/${imageName}:latest \
                --cache=true \
                --cache-repo=${REGISTRY}/${PROJECT}/kaniko-cache \
                --skip-tls-verify
              """
            }

            container('trivy') {
              sh """
              trivy image --severity HIGH,CRITICAL \
                --exit-code 0 \
                --no-progress \
                --username 'robot\$bravo+jenkins-ci' \
                --password '${env.REGISTRY_PASSWORD}' \
                ${REGISTRY}/${PROJECT}/${imageName}:${imageTag}
              """
            }
          }
        }
      }
    }
  }

  post {
    success {
      echo "✅ CI SUCCESS"
    }
    failure {
      echo "❌ CI FAILED"
    }
  }
}


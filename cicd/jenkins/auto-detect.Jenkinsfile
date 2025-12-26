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
    command: ["sleep", "infinity"]
    volumeMounts:
      - name: docker-config
        mountPath: /kaniko/.docker
      - name: workspace
        mountPath: /home/jenkins/agent
  - name: trivy
    image: aquasec/trivy:0.49.1
    command: ["sleep", "infinity"]
    volumeMounts:
      - name: workspace
        mountPath: /home/jenkins/agent
      - name: trivy-cache
        mountPath: /root/.cache
  - name: sonar
    image: sonarsource/sonar-scanner-cli:5.0
    command: ["sleep", "infinity"]
    volumeMounts:
      - name: workspace
        mountPath: /home/jenkins/agent
  volumes:
    - name: docker-config
      emptyDir: {}
    - name: workspace
      emptyDir: {}
    - name: trivy-cache
      emptyDir: {}
"""
    }
  }

  environment {
    REGISTRY = "192.168.0.244:30443"
    PROJECT  = "bravo"
    SONAR_HOST_URL = "http://sonarqube.bravo-platform-ns.svc.cluster.local:9000"
    SONAR_TOKEN = credentials("bravo-sonar")
  }

  stages {

    stage("Checkout") {
      steps {
        checkout scm
      }
    }

    stage("Detect Changed Services") {
      steps {
        script {
          sh '''
            #!/bin/bash
            set -e
            
            git fetch --tags origin
            
            # 최신 버전 태그 찾기 (1.00, 1.01, 1.02 형식)
            LATEST_TAG=$(git tag --sort=-version:refname | grep -E '^[0-9]+\\.[0-9]{2}$' | head -1)
            
            if [ -z "$LATEST_TAG" ]; then
              echo "⚠️ No version tags found (format: 1.00, 1.01...), comparing with previous commit"
              git diff --name-only HEAD~1..HEAD > changed_files.txt || true
            else
              echo "📌 Comparing with latest tag: $LATEST_TAG"
              git diff --name-only ${LATEST_TAG}..HEAD > changed_files.txt || true
            fi

            > services.txt

            if [ -s changed_files.txt ]; then
              while read file; do
                if echo "$file" | grep -q "^services/frontend-service/"; then
                  echo "frontend-service" >> services.txt
                elif echo "$file" | grep -q "^services/backend-services/"; then
                  echo "$(echo $file | cut -d/ -f3)" >> services.txt
                fi
              done < changed_files.txt
            fi

            sort -u services.txt > final_services.txt || true
            echo "=== Changed Services ==="
            cat final_services.txt || echo "No services changed"
          '''
        }
      }
    }

    stage("Generate Version Tag") {
      steps {
        script {
          def versionTag = sh(
            script: '''
              git fetch --tags origin
              LATEST_TAG=$(git tag --sort=-version:refname | grep -E '^[0-9]+\\.[0-9]{2}$' | head -1)
              
              if [ -z "$LATEST_TAG" ]; then
                echo "1.00"
              else
                # 버전을 마이너 버전으로 증가 (1.02 -> 1.03)
                MAJOR=$(echo $LATEST_TAG | cut -d. -f1)
                MINOR=$(echo $LATEST_TAG | cut -d. -f2)
                # 앞의 0을 제거하고 숫자로 변환 후 증가
                MINOR_NUM=$((MINOR + 0))
                NEW_MINOR=$((MINOR_NUM + 1))
                # 두 자리 소수점 형식 유지
                printf "%d.%02d" $MAJOR $NEW_MINOR
              fi
            ''',
            returnStdout: true
          ).trim()
          
          env.VERSION_TAG = versionTag
          echo "🏷️ Generated version tag: ${env.VERSION_TAG}"
        }
      }
    }

    stage("Build & Scan Services") {
      when {
        expression { fileExists("final_services.txt") }
      }
      steps {
        script {
          def services = readFile("final_services.txt").trim().split("\\n")

          for (svc in services) {
            if (!svc?.trim()) { continue }

            def path = svc == "frontend-service" ?
              "services/frontend-service" :
              "services/backend-services/${svc}"

            def image = "${REGISTRY}/${PROJECT}/${svc}"
            def tag = env.VERSION_TAG

            echo "🚀 Building ${svc} with tag: ${tag}"

            container('kaniko') {
              sh """
                cd /home/jenkins/agent/workspace/hiker-service
                echo "Current directory:"
                pwd
                echo "Listing workspace:"
                ls -la
                echo "Checking path: ${path}"
                ls -la ${path} || echo "Path ${path} not found"
                echo "Checking Dockerfile:"
                ls -la ${path}/Dockerfile || echo "Dockerfile not found in ${path}"
                echo "Running kaniko executor..."
                /kaniko/executor \
                  --context=${path} \
                  --dockerfile=${path}/Dockerfile \
                  --destination=${image}:${tag} \
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
                --password '${env.JENKINS_PASSWORD}' \
                ${image}:${tag}
              """
            }

            container('sonar') {
              sh """
              sonar-scanner \
                -Dsonar.projectKey=${svc} \
                -Dsonar.sources=${path} \
                -Dsonar.host.url=${SONAR_HOST_URL} \
                -Dsonar.login=${SONAR_TOKEN}
              """
            }
          }
        }
      }
    }

    stage("Create Git Tag") {
      steps {
        script {
          withCredentials([gitUsernamePassword(credentialsId: 'github-pat', gitToolName: 'git')]) {
            sh """
              git config user.name "Jenkins"
              git config user.email "jenkins@bravo"
              git tag -a ${env.VERSION_TAG} -m "Version ${env.VERSION_TAG}"
              git push origin ${env.VERSION_TAG}
            """
          }
          echo "✅ Git tag ${env.VERSION_TAG} created and pushed"
        }
      }
    }
  }

  post {
    success {
      echo "✅ CI SUCCESS - Version: ${env.VERSION_TAG}"
    }
    failure {
      echo "❌ CI FAILED"
    }
  }
}


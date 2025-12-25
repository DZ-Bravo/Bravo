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
  - name: workspace
    emptyDir: {}
  - name: docker-config
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
    SONAR_TOKEN = credentials('bravo-sonar')
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Detect Changed Services') {
      steps {
        script {
          sh '''
          echo "🔍 Detecting changed services..."

          git fetch origin main

          git diff --name-only origin/main...HEAD > changed_files.txt

          rm -f services.txt

          while read file; do
            # frontend
            if [[ "$file" == frontend-service/* ]]; then
              echo "frontend-service" >> services.txt
            fi

            # backend services
            if [[ "$file" == backend-services/*/* ]]; then
              svc=$(echo "$file" | cut -d'/' -f2)
              echo "$svc" >> services.txt
            fi
          done < changed_files.txt

          if [ ! -f services.txt ]; then
            echo "❌ No service changes detected"
            exit 1
          fi

          sort -u services.txt > final_services.txt

          echo "=== Changed Services ==="
          cat final_services.txt
          '''
        }
      }
    }

    stage('Build & Scan Services') {
      steps {
        script {
          def services = readFile('final_services.txt').trim().split("\\n")

          for (svc in services) {
            echo "🚀 Building ${svc}"

            def contextPath = (svc == "frontend-service") ?
                "services/frontend-service" :
                "services/backend-services/${svc}"

            def imageTag = "${env.BUILD_NUMBER}-${env.GIT_COMMIT.take(8)}"

            container('kaniko') {
              sh """
              /kaniko/executor \
                --dockerfile=${contextPath}/Dockerfile \
                --context=${contextPath} \
                --destination=${REGISTRY}/${PROJECT}/${svc}:${imageTag} \
                --destination=${REGISTRY}/${PROJECT}/${svc}:latest \
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
                --username '${env.REGISTRY_USER}' \
                --password '${env.REGISTRY_PASSWORD}' \
                ${REGISTRY}/${PROJECT}/${svc}:${imageTag}
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


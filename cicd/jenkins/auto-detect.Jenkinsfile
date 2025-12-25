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
    command: ["sleep"]
    args: ["infinity"]
    volumeMounts:
      - name: workspace-volume
        mountPath: /home/jenkins/agent
      - name: docker-config
        mountPath: /kaniko/.docker

  - name: trivy
    image: aquasec/trivy:0.49.1
    command: ["sleep"]
    args: ["infinity"]
    volumeMounts:
      - name: workspace-volume
        mountPath: /home/jenkins/agent
      - name: trivy-cache
        mountPath: /root/.cache

  - name: sonar
    image: sonarsource/sonar-scanner-cli:5.0
    command: ["sleep"]
    args: ["infinity"]
    volumeMounts:
      - name: workspace-volume
        mountPath: /home/jenkins/agent

  volumes:
    - name: workspace-volume
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
    BRANCH   = "${env.GIT_BRANCH ?: 'main'}"
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
            git fetch origin main
            git diff --name-only origin/main...HEAD > changed_files.txt
            cat changed_files.txt

            rm -f services.txt

            while read f; do
              if [[ "$f" == services/frontend-service/* ]]; then
                echo "frontend-service" >> services.txt
              fi

              if [[ "$f" == services/backend-services/* ]]; then
                svc=$(echo "$f" | cut -d/ -f3)
                echo "$svc" >> services.txt
              fi
            done < changed_files.txt

            sort -u services.txt > final_services.txt || true
            cat final_services.txt
          '''
        }
      }
    }

    stage('Build & Scan Services') {
      when {
        expression { fileExists('final_services.txt') }
      }
      steps {
        script {
          def services = readFile('final_services.txt').trim().split("\n")

          services.each { svc ->
            def path = svc == 'frontend-service' ?
              "services/frontend-service" :
              "services/backend-services/${svc}"

            def image = "${REGISTRY}/${PROJECT}/${svc}"
            def tag   = "${env.BUILD_NUMBER}-${env.GIT_COMMIT.take(7)}"

            echo "🚀 Building ${svc}"

            // SonarQube
            container('sonar') {
              withCredentials([string(credentialsId: 'sonarqube-token', variable: 'SONAR_TOKEN')]) {
                sh """
                  sonar-scanner \
                    -Dsonar.projectKey=${svc} \
                    -Dsonar.sources=${path} \
                    -Dsonar.host.url=http://sonarqube.bravo-platform-ns.svc.cluster.local:9000 \
                    -Dsonar.login=$SONAR_TOKEN
                """
              }
            }

            // Build & Push only on main
            if (env.BRANCH == 'main') {
              container('kaniko') {
                sh """
                  /kaniko/executor \
                    --dockerfile=${path}/Dockerfile \
                    --context=${path} \
                    --destination=${image}:${tag} \
                    --destination=${image}:latest \
                    --cache=true \
                    --cache-repo=${REGISTRY}/${PROJECT}/kaniko-cache \
                    --skip-tls-verify
                """
              }

              container('trivy') {
                sh """
                  trivy image \
                    --severity HIGH,CRITICAL \
                    --exit-code 1 \
                    --no-progress \
                    --username \$HARBOR_USER \
                    --password \$HARBOR_PASS \
                    --insecure \
                    ${image}:${tag}
                """
              }
            }
          }
        }
      }
    }
  }

  post {
    success {
      echo "✅ CI PIPELINE SUCCESS"
    }
    failure {
      echo "❌ CI PIPELINE FAILED"
    }
  }
}


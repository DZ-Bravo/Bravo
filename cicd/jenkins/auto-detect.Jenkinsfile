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
            git fetch origin main
            git diff --name-only origin/main...HEAD > changed_files.txt

            > services.txt

            while read file; do
              if [[ "$file" == frontend-service/* ]]; then
                echo "frontend-service" >> services.txt
              elif [[ "$file" == backend-services/* ]]; then
                echo "$(echo $file | cut -d/ -f2)" >> services.txt
              fi
            done < changed_files.txt

            sort -u services.txt > final_services.txt || true
            echo "=== Changed Services ==="
            cat final_services.txt || true
          '''
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
              "frontend-service" :
              "backend-services/${svc}"

            def image = "${REGISTRY}/${PROJECT}/${svc}"
            def tag   = "${env.BUILD_NUMBER}-${env.GIT_COMMIT.take(7)}"

            echo "🚀 Building ${svc}"

            container('kaniko') {
              sh """
              /kaniko/executor \
                --context=${path} \
                --dockerfile=${path}/Dockerfile \
                --destination=${image}:${tag} \
                --destination=${image}:latest \
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


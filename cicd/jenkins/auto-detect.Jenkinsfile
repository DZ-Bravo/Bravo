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
      - name: trivy-cache
        mountPath: /root/.cache
      - name: workspace-volume
        mountPath: /home/jenkins/agent

  - name: sonar-scanner
    image: sonarsource/sonar-scanner-cli:5.0
    command: ["sleep"]
    args: ["infinity"]
    volumeMounts:
      - name: workspace-volume
        mountPath: /home/jenkins/agent

  - name: jnlp
    image: jenkins/inbound-agent:3345.v03dee9b_f88fc-1
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
    REGISTRY   = "192.168.0.244:30443"
    PROJECT    = "bravo"
    SONAR_HOST = "http://sonarqube.bravo-platform-ns.svc.cluster.local:9000"
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
          def changed = sh(
            script: "git diff --name-only origin/main...HEAD",
            returnStdout: true
          ).trim().split("\n")

          def services = [] as Set

          changed.each { f ->
            if (f.startsWith("frontend-service/")) {
              services << "frontend-service"
            }
            if (f.startsWith("backend-services/")) {
              services << f.split("/")[1]
            }
          }

          if (services.isEmpty()) {
            error "❌ No service changes detected"
          }

          env.SERVICES = services.join(",")
          echo "🧩 Services to build: ${env.SERVICES}"
        }
      }
    }

    stage('Build & Scan Services') {
      steps {
        script {
          env.SERVICES.split(',').each { svc ->

            def servicePath = (svc == "frontend-service") ?
              "frontend-service" :
              "backend-services/${svc}"

            def imageName = svc
            def tag = "${env.BUILD_NUMBER}-${sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()}"

            echo "🚀 Building ${svc}"

            container('kaniko') {
              withCredentials([usernamePassword(
                credentialsId: 'jenkins',
                usernameVariable: 'HARBOR_USER',
                passwordVariable: 'HARBOR_PASS'
              )]) {

                sh """
                  mkdir -p /kaniko/.docker

                  cat <<EOF > /kaniko/.docker/config.json
                  {
                    "auths": {
                      "${REGISTRY}": {
                        "username": "${HARBOR_USER}",
                        "password": "${HARBOR_PASS}"
                      }
                    }
                  }
                  EOF

                  /kaniko/executor \
                    --dockerfile=${WORKSPACE}/services/${servicePath}/Dockerfile \
                    --context=${WORKSPACE}/services/${servicePath} \
                    --destination=${REGISTRY}/${PROJECT}/${imageName}:${tag} \
                    --destination=${REGISTRY}/${PROJECT}/${imageName}:latest \
                    --cache=true \
                    --cache-repo=${REGISTRY}/${PROJECT}/kaniko-cache \
                    --skip-tls-verify
                """
              }
            }

            container('trivy') {
              withCredentials([usernamePassword(
                credentialsId: 'jenkins',
                usernameVariable: 'HARBOR_USER',
                passwordVariable: 'HARBOR_PASS'
              )]) {

                sh """
                  trivy image \
                    --cache-dir /root/.cache \
                    --severity HIGH,CRITICAL \
                    --exit-code 1 \
                    --username ${HARBOR_USER} \
                    --password ${HARBOR_PASS} \
                    --insecure \
                    ${REGISTRY}/${PROJECT}/${imageName}:${tag}
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
      echo "✅ ALL SERVICES BUILT & SCANNED SUCCESSFULLY"
    }
    failure {
      echo "❌ PIPELINE FAILED"
    }
  }
}


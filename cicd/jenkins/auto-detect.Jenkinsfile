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
      - name: workspace-volume
        mountPath: /home/jenkins/agent
      - name: docker-config
        mountPath: /kaniko/.docker
  - name: trivy
    image: aquasec/trivy:0.49.1
    command: ["sleep", "infinity"]
    volumeMounts:
      - name: workspace-volume
        mountPath: /home/jenkins/agent
      - name: trivy-cache
        mountPath: /root/.cache
  - name: sonar-scanner
    image: sonarsource/sonar-scanner-cli:5.0
    command: ["sleep", "infinity"]
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
        GIT_BRANCH = "main"
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
                        echo "🔍 Detecting changed files..."
                        git fetch origin main
                        git diff --name-only HEAD~1..HEAD > changed_files.txt

                        echo "Changed files:"
                        cat changed_files.txt

                        > changed_services.txt

                        while read file; do
                          if [[ "$file" == services/backend-services/*/* ]]; then
                            svc=$(echo $file | cut -d/ -f3)
                            echo "backend-services/$svc" >> changed_services.txt
                          elif [[ "$file" == frontend-service/* ]]; then
                            echo "frontend-service" >> changed_services.txt
                          fi
                        done < changed_files.txt

                        sort -u changed_services.txt > services.txt
                        cat services.txt
                    '''
                }
            }
        }

        stage("Build & Scan Services") {
            when {
                expression { fileExists('services.txt') }
            }

            steps {
                script {
                    def services = readFile("services.txt").trim().split("\n")

                    for (svc in services) {
                        def servicePath = svc
                        def serviceName = svc.tokenize('/').last()
                        def imageTag = sh(
                            script: "git rev-parse --short HEAD",
                            returnStdout: true
                        ).trim()

                        echo "🚀 Building ${serviceName}"

                        container('kaniko') {
                            sh """
                            /kaniko/executor \
                              --dockerfile=${servicePath}/Dockerfile \
                              --context=${servicePath} \
                              --destination=${REGISTRY}/${PROJECT}/${serviceName}:${imageTag} \
                              --destination=${REGISTRY}/${PROJECT}/${serviceName}:latest \
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
                              --password \$HARBOR_PASSWORD \
                              --insecure \
                              ${REGISTRY}/${PROJECT}/${serviceName}:${imageTag}
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


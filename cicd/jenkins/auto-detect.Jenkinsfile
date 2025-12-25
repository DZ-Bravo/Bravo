pipeline {
  triggers {
    pollSCM('10 * * * *')
  }

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
    env:
      - name: DOCKER_CONFIG
        value: /kaniko/.docker
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
    REGISTRY   = "harbor.bravo-platform-ns.svc.cluster.local"
    CACHE_REPO = "harbor.bravo-platform-ns.svc.cluster.local/bravo/kaniko-cache"
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

BASE_COMMIT="${GIT_PREVIOUS_SUCCESSFUL_COMMIT:-}"
CURRENT_COMMIT="$(git rev-parse HEAD)"

if [ -z "$BASE_COMMIT" ]; then
  BASE_COMMIT=$(git rev-parse HEAD~1 2>/dev/null || echo "")
fi

git diff --name-only "$BASE_COMMIT" "$CURRENT_COMMIT" > changed_files.txt || true

> changed_services.txt

while read file; do
  case "$file" in
    services/backend-services/*/*)
      svc=$(echo "$file" | cut -d/ -f3)
      echo "backend-services/$svc" >> changed_services.txt
      ;;
    services/fro


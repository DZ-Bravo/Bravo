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
  - name: jnlp
    volumeMounts:
    - name: common-workspace
      mountPath: /home/jenkins/agent

  - name: kaniko
    image: gcr.io/kaniko-project/executor:debug
    command: ["sleep", "infinity"]
    env:
    - name: DOCKER_CONFIG
      value: /kaniko/.docker
    volumeMounts:
    - name: docker-config
      mountPath: /kaniko/.docker
    - name: common-workspace
      mountPath: /home/jenkins/agent

  volumes:
  - name: docker-config
    secret:
      secretName: harbor-regcred
      items:
      - key: .dockerconfigjson
        path: config.json
  - name: common-workspace
    emptyDir: {}
"""
    }
  }

  environment {
    REGISTRY = "192.168.0.244:30443"
    PROJECT  = "bravo"
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
            git fetch --tags origin

            LATEST_TAG=$(git tag -l "v*" | sort -V | tail -n 1)

            if [ -z "$LATEST_TAG" ]; then
              git diff --name-only HEAD~1..HEAD > changed_files.txt
            else
              git diff --name-only $LATEST_TAG..HEAD > changed_files.txt
            fi

            > services.txt
            while read file; do
              case "$file" in
                services/frontend-service/*|frontend-service/*)
                  echo "frontend-service" >> services.txt
                  ;;
                services/backend-services/*)
                  echo "$file" | cut -d/ -f3 >> services.txt
                  ;;
                backend-services/*)
                  echo "$file" | cut -d/ -f2 >> services.txt
                  ;;
              esac
            done < changed_files.txt

            sort -u services.txt > final_services.txt || true
            echo "=== Changed Services ==="
            cat final_services.txt || true
          '''
        }
      }
    }

    stage("Generate Version Tag") {
      steps {
        script {
          def nextTag = sh(script: '''
            LATEST=$(git tag -l "v*" | sort -V | tail -n 1 | sed 's/v//')
            if [ -z "$LATEST" ]; then
              echo "1.00"
            else
              MAJOR=$(echo $LATEST | cut -d. -f1)
              MINOR=$(echo $LATEST | cut -d. -f2)
              printf "%d.%02d" $MAJOR $((MINOR+1))
            fi
          ''', returnStdout: true).trim()

          env.VERSION_TAG = "v${nextTag}"
          echo "🏷️ New Tag: ${env.VERSION_TAG}"
        }
      }
    }

    stage("Build Services (Kaniko)") {
      when { expression { fileExists("final_services.txt") } }
      steps {
        script {
          def services = readFile("final_services.txt").trim().split("\\n")

          for (svc in services) {
            if (!svc?.trim()) continue

            /* =========================
               1. 기본값 설정
            ========================= */
            def basePath = "backend-services/${svc}"
            if (svc == "frontend-service") {
              basePath = "frontend-service"
            }

            def dockerfilePath = "${basePath}/Dockerfile"
            def contextPath    = basePath
            def imageName      = "hiking-${svc}"

            /* =========================
               2. meta 파일 있으면 덮어쓰기
            ========================= */
            def metaPath = "${basePath}/.ci-meta.yaml"
            if (fileExists(metaPath)) {
              def meta = readYaml file: metaPath

              if (meta.dockerfile) dockerfilePath = "${basePath}/${meta.dockerfile}"
              if (meta.context)    contextPath    = "${basePath}/${meta.context}"
              if (meta.image)      imageName      = meta.image
            }

            echo """
🚀 Service      : ${svc}
📦 Image        : ${imageName}:${env.VERSION_TAG}
📂 Context      : ${contextPath}
🐳 Dockerfile   : ${dockerfilePath}
"""

            container('kaniko') {
              sh """
                /kaniko/executor \
                  --context=${WORKSPACE}/${contextPath} \
                  --dockerfile=${WORKSPACE}/${dockerfilePath} \
                  --destination=${REGISTRY}/${PROJECT}/${imageName}:${env.VERSION_TAG} \
                  --cache=true \
                  --skip-tls-verify
              """
            }
          }
        }
      }
    }
  }
}


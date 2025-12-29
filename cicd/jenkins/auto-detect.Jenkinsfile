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
      value: /kaniko/.docker  # 인증 정보를 찾을 디렉토리 지정
    volumeMounts:
    - name: docker-config
      mountPath: /kaniko/.docker
    - name: common-workspace
      mountPath: /home/jenkins/agent
  - name: trivy
    image: aquasec/trivy:0.49.1
    command: ["sleep", "infinity"]
    volumeMounts:
    - name: common-workspace
      mountPath: /home/jenkins/agent
    - name: trivy-cache
      mountPath: /root/.cache
  - name: sonar
    image: sonarsource/sonar-scanner-cli:5.0
    command: ["sleep", "infinity"]
    volumeMounts:
    - name: common-workspace
      mountPath: /home/jenkins/agent
  volumes:
  - name: docker-config
    secret:
      secretName: harbor-regcred
      items:
      - key: .dockerconfigjson
        path: config.json        # 파일명을 config.json으로 고정
  - name: common-workspace
    emptyDir: {}
  - name: trivy-cache
    emptyDir: {}
"""
    }
  }

  // ... (environment 및 stages 로직은 그대로 유지)

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
          env.CURRENT_SHA = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()

          sh '''
            #!/bin/sh  # bash 의존성을 없애기 위해 표준 sh 사용
            git fetch --tags origin

            # v가 붙은 태그 중 가장 최신 것 가져오기
            LATEST_TAG=$(git tag -l "v*" | sort -V | tail -n 1)

            if [ -z "$LATEST_TAG" ]; then
              echo "⚠️ No tags found, comparing with HEAD~1"
              git diff --name-only HEAD~1..HEAD > changed_files.txt
            else
              echo "📌 Comparing with latest tag: $LATEST_TAG"
              git diff --name-only $LATEST_TAG..HEAD > changed_files.txt
            fi

            # 파일 목록 분석 (표준 sh 문법으로 수정)
            > services.txt
            while read file; do
              case "$file" in
                services/frontend-service/*|frontend-service/*)
                  echo "frontend-service" >> services.txt
                  ;;
                services/backend-services/*)
                  # services/backend-services/서비스명/... 구조에서 서비스명 추출
                  svc_name=$(echo "$file" | cut -d/ -f3)
                  echo "$svc_name" >> services.txt
                  ;;
                backend-services/*)
                  # backend-services/서비스명/... 구조에서 서비스명 추출
                  svc_name=$(echo "$file" | cut -d/ -f2)
                  echo "$svc_name" >> services.txt
                  ;;
              esac
            done < changed_files.txt

            # 중복 제거 및 결과 저장
            if [ -f services.txt ]; then
                sort -u services.txt > final_services.txt
            else
                touch final_services.txt
            fi

            echo "=== Changed Services ==="
            cat final_services.txt || echo "No services changed"
          '''
        }
      }
    }



    stage("Generate Version Tag") {
      steps {
        script {
          // v1.14 같은 형식에서 숫자만 추출하여 증가시키는 로직
          def nextTag = sh(script: '''
            LATEST_TAG=$(git tag -l "v*" | sort -V | tail -n 1 | sed 's/v//')
            if [ -z "$LATEST_TAG" ]; then echo "1.15"; else
              MAJOR=$(echo $LATEST_TAG | cut -d. -f1)
              MINOR=$(echo $LATEST_TAG | cut -d. -f2)
              NEW_MINOR=$((MINOR + 1))
              printf "%d.%02d" $MAJOR $NEW_MINOR
            fi
          ''', returnStdout: true).trim()
          env.VERSION_TAG = "v${nextTag}"
          echo "🏷️ New Tag: ${env.VERSION_TAG}"
        }
      }
    }

    stage("Build & Scan Services") {
      when { expression { fileExists("final_services.txt") } }
      steps {
        script {
          def services = readFile("final_services.txt").trim().split("\\n")
          for (svc in services) {
            if (!svc?.trim()) continue

            // 데이터 기반 경로 보정 (ai-infra-service는 backend/Dockerfile 사용)
            def basePath = fileExists("services/backend-services/${svc}") ? "services/backend-services/${svc}" : "backend-services/${svc}"
            if (svc == "frontend-service") basePath = fileExists("services/frontend-service") ? "services/frontend-service" : "frontend-service"

            def dockerfilePath = "${basePath}/Dockerfile"
            if (svc == "ai-infra-service") {
                dockerfilePath = "${basePath}/backend/Dockerfile"
            }

            echo "🚀 Building ${svc} | Path: ${basePath} | Dockerfile: ${dockerfilePath}"

            container('kaniko') {
              sh """
                /kaniko/executor \
                  --context=${WORKSPACE}/${basePath} \
                  --dockerfile=${WORKSPACE}/${dockerfilePath} \
                  --destination=${REGISTRY}/${PROJECT}/${svc}:${env.VERSION_TAG} \
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


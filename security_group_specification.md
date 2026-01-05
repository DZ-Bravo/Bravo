# AWS VPC 보안 그룹 시방서

| VPC NAME | Security Group Name | 적용 대상 | Inbound Rules | Outbound Rules | 설명 |
|----------|---------------------|-----------|---------------|----------------|------|
| bravo-vpc | bravo-mongodb-sg | MongoDB EC2 | TCP 27017 (MongoDB) : 내부 VPC 대역 (10.0.0.0/16)<br>TCP 27017 (MongoDB Replica Set) : bravo-mongodb-sg (자기 자신)<br>TCP 27017 (Monstache) : bravo-elasticsearch-redis-monstache-kibana-sg | ALL (기본 허용) | MongoDB 전용 보안 그룹으로 내부 서비스(EKS, 백엔드)에서만 접근 허용 (SSM으로 접근) |
| bravo-vpc | bravo-monitoring-sg | Monitoring NAT Monitoring Server | TCP 9090 (Prometheus) : 내부 VPC 대역 (10.0.0.0/16)<br>TCP 3000 (Grafana) : 인터넷 전체 (0.0.0.0/0)<br>TCP 3100 (Loki) : 내부 VPC 대역 (10.0.0.0/16)<br>TCP 3200 (Tempo) : 내부 VPC 대역 (10.0.0.0/16) | ALL (기본 허용) | Prometheus, Grafana, Loki, Tempo 등 모니터링 시스템 운영을 위한 보안 그룹 (SSM으로 접근) |
| bravo-vpc | bravo-alb-sg | Application Load Balancer (ALB) | TCP 80 (HTTP) : 인터넷 전체 (0.0.0.0/0)<br>TCP 443 (HTTPS) : 인터넷 전체 (0.0.0.0/0) | ALL (기본 허용) | 외부 사용자 요청을 수신하여 내부 서비스(EKS)로 전달하는 ALB용 보안 그룹 |
| bravo-vpc | bravo-eks-sg | EKS Control Plane | TCP 443 (HTTPS) : 내부 VPC 대역 (10.0.0.0/16)<br>TCP 1025-65535 (Ephemeral Ports) : 내부 VPC 대역 (10.0.0.0/16) | ALL (기본 허용) | EKS Control Plane과 워커 노드 간 통신을 위한 보안 그룹 |
| bravo-vpc | bravo-gitlab-sg | GitLab EC2 / GitLab Runner | TCP 80 (HTTP) : 인터넷 전체 (0.0.0.0/0)<br>TCP 443 (HTTPS) : 인터넷 전체 (0.0.0.0/0)<br>TCP 9000 (Container Registry) : 인터넷 전체 (0.0.0.0/0) | ALL (기본 허용) | CI/CD 파이프라인(GitLab, Runner) 운영을 위한 보안 그룹 (SSM으로 접근) |
| bravo-vpc | bravo-eks-node-sg | EKS Worker Node (EC2) | TCP 1025-65535 : bravo-eks-sg (EKS Control Plane)<br>TCP 80 (HTTP) : bravo-alb-sg (ALB)<br>TCP 27017 (MongoDB) : Pod CIDR (10.0.20.0/24) | ALL (기본 허용) | EKS 워커 노드 전용 보안 그룹으로 Control Plane, ALB, MongoDB 접근 허용 |
| bravo-vpc | bravo-elasticsearch-redis-monstache-kibana-sg | Elasticsearch + Redis + Monstache + Kibana EC2 | TCP 9200 (Elasticsearch) : 내부 VPC 대역 (10.0.0.0/16)<br>TCP 5601 (Kibana) : 내부 VPC 대역 (10.0.0.0/16)<br>TCP 6379 (Redis) : 내부 VPC 대역 (10.0.0.0/16) | ALL (기본 허용) | Elasticsearch, Redis, Monstache, Kibana 통합 노드 운영을 위한 보안 그룹 (SSM으로 접근) |



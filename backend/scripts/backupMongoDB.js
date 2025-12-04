import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const execAsync = promisify(exec)

// 백업 디렉토리 (호스트 경로)
const BACKUP_DIR = join(process.cwd(), '..', 'backups')
const BACKUP_NAME = `hiking_backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}`

async function backupMongoDB() {
  try {
    // 백업 디렉토리 생성
    if (!existsSync(BACKUP_DIR)) {
      mkdirSync(BACKUP_DIR, { recursive: true })
      console.log(`백업 디렉토리 생성: ${BACKUP_DIR}`)
    }

    const backupPath = join(BACKUP_DIR, BACKUP_NAME)
    
    console.log('MongoDB 백업 시작...')
    console.log(`백업 경로: ${backupPath}`)
    
    // mongodump 명령어 실행
    // 컨테이너 내부에서 실행하므로 컨테이너 이름 사용
    const command = `docker compose exec -T mongodb mongodump --uri="mongodb://admin:admin123@localhost:27017/hiking?authSource=admin" --out=/tmp/${BACKUP_NAME}`
    
    console.log('백업 명령어 실행 중...')
    const { stdout, stderr } = await execAsync(command)
    
    if (stderr && !stderr.includes('writing')) {
      console.error('백업 중 오류:', stderr)
    }
    
    // 백업 파일을 호스트로 복사
    console.log('백업 파일을 호스트로 복사 중...')
    const copyCommand = `docker compose cp mongodb:/tmp/${BACKUP_NAME} ${backupPath}`
    await execAsync(copyCommand)
    
    // 컨테이너 내부의 임시 파일 삭제
    console.log('컨테이너 내부 임시 파일 삭제 중...')
    const cleanupCommand = `docker compose exec -T mongodb rm -rf /tmp/${BACKUP_NAME}`
    await execAsync(cleanupCommand)
    
    console.log(`\n백업 완료!`)
    console.log(`백업 위치: ${backupPath}`)
    
    // 압축 옵션 (선택사항)
    console.log('\n압축 중...')
    const compressCommand = `cd ${BACKUP_DIR} && tar -czf ${BACKUP_NAME}.tar.gz ${BACKUP_NAME} && rm -rf ${BACKUP_NAME}`
    await execAsync(compressCommand)
    
    console.log(`압축 완료: ${backupPath}.tar.gz`)
    
  } catch (error) {
    console.error('백업 실패:', error.message)
    process.exit(1)
  }
}

backupMongoDB()


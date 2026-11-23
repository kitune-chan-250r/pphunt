pipeline {
  agent any

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build') {
      agent {
        docker {
          image 'mcr.microsoft.com/devcontainers/typescript-node:5-26-bookworm'
          reuseNode true
        }
      }

      steps {
        sh '''
          set -eu

          echo "=== Execution identity ==="
          id

          echo "=== Original environment ==="
          echo "HOME=${HOME:-<unset>}"
          npm config get cache

          # ホームとnpmキャッシュをワークスペース配下に統一
          export HOME="$WORKSPACE/.home"
          export NPM_CONFIG_CACHE="$WORKSPACE/.npm-cache"

          mkdir -p "$HOME" "$NPM_CONFIG_CACHE"

          echo "=== Effective npm cache ==="
          npm config get cache

          npm ci
          npm run build
        '''

        archiveArtifacts artifacts: 'dist/**', fingerprint: true
      }
    }
  }
}
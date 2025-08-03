/**
 * アップロード日付を日本語形式でフォーマットする
 * @param dateString - ISO形式の日付文字列
 * @returns フォーマットされた日付文字列
 */
export function formatUploadDate(dateString: string): string {
  if (!dateString) return '日付不明'
  
  try {
    const date = new Date(dateString)
    
    // 無効な日付の場合はエラーメッセージを返す
    if (isNaN(date.getTime())) {
      return '日付形式エラー'
    }
    
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    const hours = date.getHours()
    const minutes = date.getMinutes()
    
    // 日本語形式でフォーマット: YYYY年MM月DD日 HH:MM
    return `${year}年${month.toString().padStart(2, '0')}月${day.toString().padStart(2, '0')}日 ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  } catch (error) {
    console.error('Date formatting error:', error)
    return '日付フォーマットエラー'
  }
}

/**
 * 日付を短縮形式でフォーマットする（例: 2024/01/15）
 * @param dateString - ISO形式の日付文字列
 * @returns 短縮形式の日付文字列
 */
export function formatShortDate(dateString: string): string {
  if (!dateString) return '--'
  
  try {
    const date = new Date(dateString)
    
    if (isNaN(date.getTime())) {
      return '--'
    }
    
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    
    return `${year}/${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}`
  } catch (error) {
    console.error('Short date formatting error:', error)
    return '--'
  }
}

/**
 * 相対時間を表示する（例: 3時間前、昨日、1週間前）
 * @param dateString - ISO形式の日付文字列
 * @returns 相対時間の文字列
 */
export function formatRelativeTime(dateString: string): string {
  if (!dateString) return '--'
  
  try {
    const date = new Date(dateString)
    const now = new Date()
    
    if (isNaN(date.getTime())) {
      return '--'
    }
    
    const diffInMs = now.getTime() - date.getTime()
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60))
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60))
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))
    
    if (diffInMinutes < 1) {
      return '今'
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes}分前`
    } else if (diffInHours < 24) {
      return `${diffInHours}時間前`
    } else if (diffInDays === 1) {
      return '昨日'
    } else if (diffInDays < 7) {
      return `${diffInDays}日前`
    } else if (diffInDays < 30) {
      const weeks = Math.floor(diffInDays / 7)
      return `${weeks}週間前`
    } else {
      return formatShortDate(dateString)
    }
  } catch (error) {
    console.error('Relative time formatting error:', error)
    return '--'
  }
} 
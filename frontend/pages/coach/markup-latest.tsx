import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'

export default function MarkupLatestPage() {
  const router = useRouter()
  const { video_id, phase } = router.query
  const imageRef = useRef<HTMLImageElement>(null)
  
  const [imageUrl, setImageUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [isClearing, setIsClearing] = useState(false)

  useEffect(() => {
    if (video_id && phase && typeof video_id === 'string' && typeof phase === 'string') {
      loadLatestMarkupImage(video_id, phase)
    }
  }, [video_id, phase])

  // Add refresh effect when page becomes visible (handles browser back/forward)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && video_id && phase && typeof video_id === 'string' && typeof phase === 'string') {
        console.log('Page became visible, refreshing markup image')
        loadLatestMarkupImage(video_id, phase)
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [video_id, phase])

  const loadLatestMarkupImage = async (videoId: string, phaseName: string) => {
    try {
      setLoading(true)
      setError('')
      console.log(`Loading latest markup for video ${videoId}, phase ${phaseName}`)
      
      // Add timestamp to prevent caching and ensure latest data
      const timestamp = Date.now()
      
      // Get saved advices from API first, fallback to localStorage
      let parsedAdvices = []
      try {
        // Clear any cached responses by adding timestamp
        const response = await fetch(`/api/v1/get-advices/${videoId}?_t=${timestamp}`, {
          cache: 'no-cache', // Force no cache
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        })
        if (response.ok) {
          const data = await response.json()
          parsedAdvices = data.advices || []
          console.log(`Loaded ${parsedAdvices.length} advices from API`)
        } else {
          console.error('Failed to load advices from API:', response.statusText)
          // Fallback to localStorage
          const saved = localStorage.getItem(`advices_${videoId}`)
          if (saved) {
            parsedAdvices = JSON.parse(saved)
            console.log(`Loaded ${parsedAdvices.length} advices from localStorage fallback`)
          }
        }
      } catch (error) {
        console.error('Error loading advices from API:', error)
        // Fallback to localStorage
        const saved = localStorage.getItem(`advices_${videoId}`)
        if (saved) {
          parsedAdvices = JSON.parse(saved)
          console.log(`Loaded ${parsedAdvices.length} advices from localStorage after error`)
        }
      }
       
       if (parsedAdvices.length === 0) {
         setError('アドバイスデータが見つかりませんでした。')
         setLoading(false)
         return
       }
      const phaseAdvice = parsedAdvices.find((advice: any) => advice.phase === phaseName)
      
      if (!phaseAdvice || !phaseAdvice.captureUrl) {
        console.log('Phase advice not found or no capture URL')
        console.log('Available advices:', parsedAdvices.map(a => ({ phase: a.phase, captureUrl: a.captureUrl })))
        setError('この段階のマークアップ画像が見つかりませんでした。')
        setLoading(false)
        return
      }

      console.log('Found phase advice with capture URL:', phaseAdvice.captureUrl)
      console.log('Phase advice object:', phaseAdvice)
      console.log('Last updated timestamp:', phaseAdvice.lastUpdated)
      
      // Handle markup:// references (stored in localStorage)
      if (phaseAdvice.captureUrl.startsWith('markup://')) {
        const filename = phaseAdvice.captureUrl.replace('markup://', '')
        const markupImageKey = `markup_${filename}`
        const storedDataUrl = localStorage.getItem(markupImageKey)
        
        if (storedDataUrl) {
          console.log('Using stored markup image from localStorage')
          setImageUrl(storedDataUrl)
          setLoading(false)
          return
        } else {
          setError('マークアップ画像データが見つかりませんでした。')
          setLoading(false)
          return
        }
      }
      
      // Handle blob URLs (_Mark. files)
      if (phaseAdvice.captureUrl.includes('_Mark.')) {
        console.log('Using latest markup image from blob storage:', phaseAdvice.captureUrl)
        
        // Use proxy URL to avoid CORS issues, add timestamp to prevent caching
        const cacheBuster = `?_t=${timestamp}&v=${phaseAdvice.lastUpdated || Date.now()}`
        const proxyUrl = `/api/v1/proxy-file/${encodeURIComponent(phaseAdvice.captureUrl)}${cacheBuster}`
        console.log('Using proxy URL for latest markup with cache buster:', proxyUrl)
        setImageUrl(proxyUrl)
        setLoading(false)
        return
      }
      
      // If it's a regular image (not marked up), show error
      setError('この段階にはマークアップ画像がありません。')
      setLoading(false)
      
    } catch (error) {
      console.error('Error loading latest markup image:', error)
      setError('マークアップ画像の読み込み中にエラーが発生しました。')
      setLoading(false)
    }
  }

  const handleImageLoad = () => {
    console.log('Latest markup image loaded successfully')
    setLoading(false)
    setError('')
  }

  const handleImageError = () => {
    console.error('Failed to load latest markup image:', imageUrl)
    setError('マークアップ画像の読み込みに失敗しました。')
    setLoading(false)
  }

  const clearMarkup = async () => {
    if (!video_id || !phase) return
    
    setIsClearing(true)
    try {
      // Get current advices from API first, fallback to localStorage
      let parsedAdvices = []
      try {
        const response = await fetch(`/api/v1/get-advices/${video_id}`)
        if (response.ok) {
          const data = await response.json()
          parsedAdvices = data.advices || []
        } else {
          // Fallback to localStorage
          const saved = localStorage.getItem(`advices_${video_id}`)
          if (saved) {
            parsedAdvices = JSON.parse(saved)
          }
        }
      } catch (error) {
        console.error('Error loading advices from API:', error)
        // Fallback to localStorage
        const saved = localStorage.getItem(`advices_${video_id}`)
        if (saved) {
          parsedAdvices = JSON.parse(saved)
        }
      }
      
      if (parsedAdvices.length > 0) {
        // Find the original image URL (without _Mark)
        const phaseAdvice = parsedAdvices.find((advice: any) => advice.phase === phase)
        if (phaseAdvice && phaseAdvice.captureUrl) {
          let originalUrl = phaseAdvice.captureUrl
          
          if (phaseAdvice.captureUrl.includes('_Mark.')) {
            // Remove _Mark from filename
            const filename = phaseAdvice.captureUrl.split('/').pop() || ''
            const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')
            const extension = filename.includes('.') ? filename.split('.').pop() : 'jpg'
            
            if (nameWithoutExt.endsWith('_Mark')) {
              const originalName = nameWithoutExt.replace('_Mark', '')
              const originalFilename = `${originalName}.${extension}`
              
              // Reconstruct original URL
              const urlParts = phaseAdvice.captureUrl.split('/')
              urlParts[urlParts.length - 1] = originalFilename
              originalUrl = urlParts.join('/')
            }
          }
          
          // Update advice to use original image
          const updatedAdvices = parsedAdvices.map((advice: any) => {
            if (advice.phase === phase) {
              console.log(`Clearing markup for phase ${phase}, using original URL: ${originalUrl}`)
              return {
                ...advice,
                captureUrl: originalUrl,
                captureSasUrl: originalUrl
              }
            }
            return advice
          })
          
          // Save to API
          const saveResponse = await fetch(`/api/v1/save-advices/${video_id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatedAdvices)
          })
          
          if (saveResponse.ok) {
            console.log('Markup cleared, updated advices saved to API')
            // Also save to localStorage as backup
            localStorage.setItem(`advices_${video_id}`, JSON.stringify(updatedAdvices))
          } else {
            console.error('Failed to save advices to API:', saveResponse.statusText)
            // Fallback to localStorage only
            localStorage.setItem(`advices_${video_id}`, JSON.stringify(updatedAdvices))
          }
          
          // Navigate to markup page with original image
          if (typeof video_id === 'string' && typeof phase === 'string') {
            router.push(`/coach/markup?video_id=${video_id}&phase=${encodeURIComponent(phase)}&capture_url=${encodeURIComponent(originalUrl)}`)
          }
        } else {
          console.log('No phase advice found for clearing markup')
          alert('マークアップをクリアする対象が見つかりませんでした。')
        }
      } else {
        console.log('No existing advices found')
        alert('アドバイスデータが見つかりませんでした。')
      }
    } catch (error) {
      console.error('Error clearing markup:', error)
      alert('マークアップのクリア中にエラーが発生しました。')
    } finally {
      setIsClearing(false)
    }
  }

  const clearMarkupAndBack = async () => {
    if (!video_id || !phase) return
    
    setIsClearing(true)
    try {
      // Get current advices from API first, fallback to localStorage
      let parsedAdvices = []
      try {
        const response = await fetch(`/api/v1/get-advices/${video_id}`)
        if (response.ok) {
          const data = await response.json()
          parsedAdvices = data.advices || []
        } else {
          // Fallback to localStorage
          const saved = localStorage.getItem(`advices_${video_id}`)
          if (saved) {
            parsedAdvices = JSON.parse(saved)
          }
        }
      } catch (error) {
        console.error('Error loading advices from API:', error)
        // Fallback to localStorage
        const saved = localStorage.getItem(`advices_${video_id}`)
        if (saved) {
          parsedAdvices = JSON.parse(saved)
        }
      }
      
      if (parsedAdvices.length > 0) {
        // Find the original image URL (without _Mark)
        const phaseAdvice = parsedAdvices.find((advice: any) => advice.phase === phase)
        if (phaseAdvice && phaseAdvice.captureUrl) {
          let originalUrl = phaseAdvice.captureUrl
          
          if (phaseAdvice.captureUrl.includes('_Mark.')) {
            // Remove _Mark from filename
            const filename = phaseAdvice.captureUrl.split('/').pop() || ''
            const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')
            const extension = filename.includes('.') ? filename.split('.').pop() : 'jpg'
            
            if (nameWithoutExt.endsWith('_Mark')) {
              const originalName = nameWithoutExt.replace('_Mark', '')
              const originalFilename = `${originalName}.${extension}`
              
              // Reconstruct original URL
              const urlParts = phaseAdvice.captureUrl.split('/')
              urlParts[urlParts.length - 1] = originalFilename
              originalUrl = urlParts.join('/')
            }
          }
          
          // Update advice to use original image
          const updatedAdvices = parsedAdvices.map((advice: any) => {
            if (advice.phase === phase) {
              console.log(`Clearing markup for phase ${phase}, using original URL: ${originalUrl}`)
              return {
                ...advice,
                captureUrl: originalUrl,
                captureSasUrl: originalUrl
              }
            }
            return advice
          })
          
          // Save to API
          const saveResponse = await fetch(`/api/v1/save-advices/${video_id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatedAdvices)
          })
          
          if (saveResponse.ok) {
            console.log('Markup cleared and returning to list, updated advices saved to API')
            // Also save to localStorage as backup
            localStorage.setItem(`advices_${video_id}`, JSON.stringify(updatedAdvices))
          } else {
            console.error('Failed to save advices to API:', saveResponse.statusText)
            // Fallback to localStorage only
            localStorage.setItem(`advices_${video_id}`, JSON.stringify(updatedAdvices))
          }
          
          // Navigate back to advice page
          router.push(`/coach/advice?video_id=${video_id}`)
        } else {
          console.log('No phase advice found for clearing markup')
          alert('マークアップをクリアする対象が見つかりませんでした。')
        }
      } else {
        console.log('No existing advices found')
        alert('アドバイスデータが見つかりませんでした。')
      }
    } catch (error) {
      console.error('Error clearing markup:', error)
      alert('マークアップのクリア中にエラーが発生しました。')
    } finally {
      setIsClearing(false)
    }
  }

  const handleBack = () => {
    router.back()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">最新のマークアップ画像を読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">最新マークアップ画像</h1>
              <p className="text-gray-600 mt-1">
                {phase && `段階: ${phase}`}
              </p>
            </div>
            <button
              onClick={handleBack}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              ← 戻る
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          {/* Action Buttons */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={clearMarkup}
              disabled={isClearing}
              className={`px-4 py-2 rounded-lg transition-colors ${
                isClearing
                  ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                  : 'bg-red-500 text-white hover:bg-red-600'
              }`}
            >
              {isClearing ? 'クリア中...' : 'マークアップをクリアして再マークアップ'}
            </button>
            <button
              onClick={clearMarkupAndBack}
              disabled={isClearing}
              className={`px-4 py-2 rounded-lg transition-colors ${
                isClearing
                  ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                  : 'bg-orange-500 text-white hover:bg-orange-600'
              }`}
            >
              {isClearing ? 'クリア中...' : 'マークアップをクリアして戻る'}
            </button>
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              戻る
            </button>
          </div>

          {/* Image Display */}
          <div className="flex justify-center">
            <div className="relative max-w-full inline-block">
              {imageUrl && (
                <div className="relative inline-block">
                  <img
                    ref={imageRef}
                    src={imageUrl}
                    alt={`${phase}最新マークアップ画像`}
                    className="max-w-full h-auto block"
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                    style={{ pointerEvents: 'none' }}
                    crossOrigin="anonymous"
                  />
                </div>
              )}
              {error && (
                <div className="w-96 h-64 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <span className="text-red-500 block mb-2">{error}</span>
                    <button
                      onClick={() => {
                        if (video_id && phase && typeof video_id === 'string' && typeof phase === 'string') {
                          loadLatestMarkupImage(video_id, phase)
                        }
                      }}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      再試行
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">最新マークアップ画像</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• この画像は最新のマークアップが適用されています</li>
              <li>• 「マークアップをクリアして再マークアップ」で元の画像に戻して新しくマークアップできます</li>
              <li>• 「マークアップをクリアして戻る」で元の画像に戻して一覧画面に戻ります</li>
              <li>• 「戻る」で前の画面に戻ります</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
} 
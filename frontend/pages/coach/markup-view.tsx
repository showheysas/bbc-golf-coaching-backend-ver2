import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'

interface MediaUrlResponse {
  url: string
}

export default function MarkupViewPage() {
  const router = useRouter()
  const { video_id, phase, capture_url } = router.query
  const imageRef = useRef<HTMLImageElement>(null)
  
  const [imageSasUrl, setImageSasUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [imageError, setImageError] = useState<string>('')
  const [isClearing, setIsClearing] = useState(false)

  useEffect(() => {
    if (capture_url && typeof capture_url === 'string') {
      fetchImageSasUrl(capture_url)
    }
  }, [capture_url, video_id, phase])

    const fetchImageSasUrl = async (imageUrl: string) => {
    try {
      setLoading(true)
      console.log('Fetching markup image URL:', imageUrl)
      
      // Always try to find the latest markup image for this phase first
      if (video_id && phase && typeof video_id === 'string' && typeof phase === 'string') {
        const videoId = video_id
        const phaseName = phase
        
        console.log(`Looking for latest markup for video ${videoId}, phase ${phaseName}`)
        
        // Get saved advices from localStorage
        const saved = localStorage.getItem(`advices_${videoId}`)
        if (saved) {
          try {
            const parsedAdvices = JSON.parse(saved)
            const phaseAdvice = parsedAdvices.find((advice: any) => advice.phase === phaseName)
            
            if (phaseAdvice && phaseAdvice.captureUrl) {
              console.log('Found phase advice with capture URL:', phaseAdvice.captureUrl)
              
              // Check if this is a markup image reference
              if (phaseAdvice.captureUrl.startsWith('markup://')) {
                const filename = phaseAdvice.captureUrl.replace('markup://', '')
                const markupImageKey = `markup_${filename}`
                const storedDataUrl = localStorage.getItem(markupImageKey)
                if (storedDataUrl) {
                  console.log('Using latest stored markup image from localStorage')
                  setImageSasUrl(storedDataUrl)
                  setLoading(false)
                  return
                }
              }
              
              // If it's a blob URL, try to get the latest version
              if (phaseAdvice.captureUrl.includes('_Mark.')) {
                console.log('Using latest markup image from blob storage:', phaseAdvice.captureUrl)
                
                // Use proxy URL to avoid CORS issues
                const proxyUrl = `/api/v1/proxy-file/${encodeURIComponent(phaseAdvice.captureUrl)}`
                console.log('Using proxy URL for latest markup:', proxyUrl)
                setImageSasUrl(proxyUrl)
                setLoading(false)
                return
              }
            } else {
              console.log('No phase advice found for:', phaseName)
            }
          } catch (parseError) {
            console.error('Error parsing saved advices:', parseError)
          }
        } else {
          console.log('No saved advices found for video:', videoId)
        }
      }
      
      // Fallback to original logic if no latest markup found
      console.log('No latest markup found, using original URL:', imageUrl)
      
      // Check if this is a markup image reference
      if (imageUrl.startsWith('markup://')) {
        const filename = imageUrl.replace('markup://', '')
        const markupImageKey = `markup_${filename}`
        const storedDataUrl = localStorage.getItem(markupImageKey)
        if (storedDataUrl) {
          console.log('Using stored markup image from localStorage')
          setImageSasUrl(storedDataUrl)
          setLoading(false)
          return
        }
      }
      
      // Try proxy first for better compatibility
      const proxyUrl = `/api/v1/proxy-file/${encodeURIComponent(imageUrl)}`
      console.log('Using proxy URL:', proxyUrl)
      setImageSasUrl(proxyUrl)
      
      // Also try to get SAS URL as backup
      try {
        const apiUrl = `/api/v1/media-url?blob_url=${encodeURIComponent(imageUrl)}`
        console.log('Calling API for SAS URL:', apiUrl)
        const response = await fetch(apiUrl)
        console.log('API response status:', response.status)
        
        if (response.ok) {
          const data: MediaUrlResponse = await response.json()
          console.log('SAS URL received:', data.url)
          // Keep proxy URL for now, but log the SAS URL for debugging
        } else {
          console.error('Failed to get SAS URL:', response.statusText)
          const responseText = await response.text()
          console.error('Response text:', responseText)
        }
      } catch (sasError) {
        console.error('SAS URL fetch error:', sasError)
      }
    } catch (error) {
      console.error('Error fetching image URL:', error)
      // Fallback to proxy
      const proxyUrl = `/api/v1/proxy-file/${encodeURIComponent(imageUrl)}`
      console.log('Using proxy fallback due to error:', proxyUrl)
      setImageSasUrl(proxyUrl)
    } finally {
      setLoading(false)
    }
  }

  const handleImageLoad = () => {
    console.log('Markup image loaded successfully')
    setLoading(false)
    setImageError('')
  }

  const handleImageError = () => {
    console.error('Failed to load markup image:', imageSasUrl)
    setImageError(`マークアップ画像の読み込みに失敗しました: ${imageSasUrl}`)
    setLoading(false)
  }

    const clearMarkup = async () => {
    if (!video_id || !phase) return
    
    setIsClearing(true)
    try {
      // Find the original image URL (without _Mark)
      const currentUrl = capture_url as string
      let originalUrl = currentUrl
      
      if (currentUrl.includes('_Mark.')) {
        // Remove _Mark from filename
        const filename = currentUrl.split('/').pop() || ''
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')
        const extension = filename.includes('.') ? filename.split('.').pop() : 'jpg'
        
        if (nameWithoutExt.endsWith('_Mark')) {
          const originalName = nameWithoutExt.replace('_Mark', '')
          const originalFilename = `${originalName}.${extension}`
          
          // Reconstruct original URL
          const urlParts = currentUrl.split('/')
          urlParts[urlParts.length - 1] = originalFilename
          originalUrl = urlParts.join('/')
        }
      }
      
      // Update localStorage to use original image
      const saved = localStorage.getItem(`advices_${video_id as string}`)
      if (saved) {
        const parsedAdvices = JSON.parse(saved)
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
        if (typeof video_id === 'string') {
          localStorage.setItem(`advices_${video_id}`, JSON.stringify(updatedAdvices))
        }
        console.log('Markup cleared, updated advices saved to localStorage')
        
        // Navigate to markup page with original image
        if (typeof video_id === 'string' && typeof phase === 'string') {
          router.push(`/coach/markup?video_id=${video_id}&phase=${encodeURIComponent(phase)}&capture_url=${encodeURIComponent(originalUrl)}`)
        }
      } else {
        console.log('No existing advices found in localStorage')
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
      // Find the original image URL (without _Mark)
      const currentUrl = capture_url as string
      let originalUrl = currentUrl
      
      if (currentUrl.includes('_Mark.')) {
        // Remove _Mark from filename
        const filename = currentUrl.split('/').pop() || ''
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')
        const extension = filename.includes('.') ? filename.split('.').pop() : 'jpg'
        
        if (nameWithoutExt.endsWith('_Mark')) {
          const originalName = nameWithoutExt.replace('_Mark', '')
          const originalFilename = `${originalName}.${extension}`
          
          // Reconstruct original URL
          const urlParts = currentUrl.split('/')
          urlParts[urlParts.length - 1] = originalFilename
          originalUrl = urlParts.join('/')
        }
      }
      
      // Update localStorage to use original image
      if (typeof video_id === 'string') {
        const saved = localStorage.getItem(`advices_${video_id}`)
        if (saved) {
          const parsedAdvices = JSON.parse(saved)
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
          localStorage.setItem(`advices_${video_id}`, JSON.stringify(updatedAdvices))
          console.log('Markup cleared and returning to list, updated advices saved to localStorage')
          
          // Navigate back to advice page
          router.push(`/coach/advice?video_id=${video_id}`)
        } else {
          console.log('No existing advices found in localStorage')
          alert('アドバイスデータが見つかりませんでした。')
        }
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
          <p className="text-gray-600">マークアップ画像を読み込み中...</p>
          {capture_url && (
            <p className="text-sm text-gray-500 mt-2">URL: {capture_url}</p>
          )}
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
              <h1 className="text-3xl font-bold text-gray-900">マークアップ済み画像</h1>
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
              {imageSasUrl && (
                <div className="relative inline-block">
                  <img
                    ref={imageRef}
                    src={imageSasUrl}
                    alt={`${phase}マークアップ済み画像`}
                    className="max-w-full h-auto block"
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                    style={{ pointerEvents: 'none' }}
                    crossOrigin="anonymous"
                  />
                </div>
              )}
              {!imageSasUrl && (
                <div className="w-96 h-64 bg-gray-200 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <span className="text-gray-500 block mb-2">画像が見つかりません</span>
                    <span className="text-sm text-gray-400">URL: {capture_url}</span>
                  </div>
                </div>
              )}
              {imageError && (
                <div className="w-96 h-64 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <span className="text-red-500 block mb-2">{imageError}</span>
                    <p className="text-xs text-gray-500 mb-2">URL: {capture_url}</p>
                    <button
                      onClick={() => {
                        setImageError('')
                        setLoading(true)
                        if (capture_url && typeof capture_url === 'string') {
                          fetchImageSasUrl(capture_url)
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
            <h3 className="font-medium text-blue-900 mb-2">マークアップ済み画像</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• この画像は既にマークアップが適用されています</li>
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
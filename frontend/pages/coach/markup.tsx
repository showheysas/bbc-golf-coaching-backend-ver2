import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'

interface MediaUrlResponse {
  url: string
}

export default function MarkupPage() {
  const router = useRouter()
  const { video_id, phase, capture_url } = router.query
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageSasUrl, setImageSasUrl] = useState<string>('')
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentTool, setCurrentTool] = useState<'circle' | 'line' | 'polyline'>('circle')
  const [currentColor, setCurrentColor] = useState<'red' | 'blue' | 'yellow'>('red')
  const [startPoint, setStartPoint] = useState<{x: number, y: number} | null>(null)
  const [polylinePoints, setPolylinePoints] = useState<Array<{x: number, y: number}>>([])
  const [drawHistory, setDrawHistory] = useState<Array<{
    type: 'circle' | 'line' | 'polyline', 
    data: {
      center?: {x: number, y: number},
      radius?: number,
      start?: {x: number, y: number},
      end?: {x: number, y: number},
      points?: Array<{x: number, y: number}>,
      color: 'red' | 'blue' | 'yellow'
    }
  }>>([])
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [imageError, setImageError] = useState<string>('')

  useEffect(() => {
    if (capture_url && typeof capture_url === 'string') {
      fetchImageSasUrl(capture_url)
    }
  }, [capture_url])

  // Add window resize handler to recalculate canvas size
  useEffect(() => {
    const handleResize = () => {
      if (imageLoaded && canvasRef.current && imageRef.current) {
        const canvas = canvasRef.current
        const img = imageRef.current
        const rect = img.getBoundingClientRect()
        
        canvas.width = rect.width
        canvas.height = rect.height
        canvas.style.width = `${rect.width}px`
        canvas.style.height = `${rect.height}px`
      }
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [imageLoaded])

  const fetchImageSasUrl = async (imageUrl: string) => {
    try {
      setLoading(true)
      console.log('Fetching image URL:', imageUrl)
      
      // For markup pages, we want to show the latest markup image (not the original)
      // This allows users to add more markup on top of existing markup
      let displayImageUrl = imageUrl
      console.log('Using image URL for markup display:', displayImageUrl)
      
      // Check if this is a markup image reference
      if (displayImageUrl.startsWith('markup://')) {
        const filename = displayImageUrl.replace('markup://', '')
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
      const proxyUrl = `/api/v1/proxy-file/${encodeURIComponent(displayImageUrl)}`
      console.log('Using proxy URL:', proxyUrl)
      setImageSasUrl(proxyUrl)
      
      // Also try to get SAS URL as backup
      try {
        const apiUrl = `/api/v1/media-url?blob_url=${encodeURIComponent(displayImageUrl)}`
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
    console.log('Image loaded successfully')
    setImageLoaded(true)
    setLoading(false)
    setImageError('')
    
    // Use setTimeout to ensure the image is fully rendered and has correct dimensions
    setTimeout(() => {
      if (canvasRef.current && imageRef.current) {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        const img = imageRef.current
        
        // Get the actual displayed dimensions of the image
        const rect = img.getBoundingClientRect()
        const displayWidth = rect.width
        const displayHeight = rect.height
        
        // Set canvas dimensions to match exactly
        canvas.width = displayWidth
        canvas.height = displayHeight
        canvas.style.width = `${displayWidth}px`
        canvas.style.height = `${displayHeight}px`
        
        // Clear canvas - don't draw the image on canvas
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
      }
    }, 100)
  }

  const getCanvasPosition = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): {x: number, y: number} => {
    if (!canvasRef.current) return {x: 0, y: 0}
    
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    
    let clientX: number, clientY: number
    
    if ('touches' in e) {
      // Touch event
      const touch = e.touches[0] || e.changedTouches[0]
      clientX = touch.clientX
      clientY = touch.clientY
    } else {
      // Mouse event
      clientX = e.clientX
      clientY = e.clientY
    }
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    }
  }

  const drawPolylineSegment = (start: {x: number, y: number}, end: {x: number, y: number}) => {
    if (!canvasRef.current) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    
    if (ctx) {
      const colorMap = {
        red: '#ff0000',
        blue: '#0066ff',
        yellow: '#ffdd00'
      }
      ctx.strokeStyle = colorMap[currentColor]
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()
    }
  }

  const handlePointerStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const pos = getCanvasPosition(e)
    
    if (currentTool === 'polyline') {
      // For polyline, add points to the array
      const newPoints = [...polylinePoints, pos]
      setPolylinePoints(newPoints)
      
      // If we have 2 points, draw the first line segment
      if (newPoints.length === 2) {
        drawPolylineSegment(newPoints[0], newPoints[1])
      }
      // If we have 3 points, draw the second line segment and complete the polyline
      else if (newPoints.length === 3) {
        drawPolylineSegment(newPoints[1], newPoints[2])
        
        // Add to draw history
        setDrawHistory(prev => [...prev, {
          type: 'polyline',
          data: {
            points: newPoints,
            color: currentColor
          }
        }])
        
        // Reset polyline points for next polyline
        setPolylinePoints([])
      }
    } else {
      // For circle and line, set start point
      setStartPoint(pos)
      setIsDrawing(true)
    }
  }

  const handlePointerEnd = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    
    if (currentTool === 'polyline') {
      // For polyline, we don't need to do anything in handlePointerEnd
      // The drawing is handled in handlePointerStart
      return
    }
    
    if (!isDrawing || !startPoint || !canvasRef.current) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const endPos = getCanvasPosition(e)
    
    if (ctx) {
      // Set color based on current selection
      const colorMap = {
        red: '#ff0000',
        blue: '#0066ff',
        yellow: '#ffdd00'
      }
      ctx.strokeStyle = colorMap[currentColor]
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      
      if (currentTool === 'circle') {
        // Draw circle
        const radius = Math.sqrt(
          Math.pow(endPos.x - startPoint.x, 2) + Math.pow(endPos.y - startPoint.y, 2)
        )
        ctx.beginPath()
        ctx.arc(startPoint.x, startPoint.y, radius, 0, 2 * Math.PI)
        ctx.stroke()
        
        // Add to draw history
        setDrawHistory(prev => [...prev, {
          type: 'circle',
          data: {
            center: startPoint,
            radius: radius,
            color: currentColor
          }
        }])
      } else if (currentTool === 'line') {
        // Draw line
        ctx.beginPath()
        ctx.moveTo(startPoint.x, startPoint.y)
        ctx.lineTo(endPos.x, endPos.y)
        ctx.stroke()
        
        // Add to draw history
        setDrawHistory(prev => [...prev, {
          type: 'line',
          data: {
            start: startPoint,
            end: endPos,
            color: currentColor
          }
        }])
      }
    }
    
    setIsDrawing(false)
    setStartPoint(null)
  }

  const clearCanvas = () => {
    if (canvasRef.current) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
    // Clear polyline points and draw history
    setPolylinePoints([])
    setDrawHistory([])
  }

  const clearLastItem = () => {
    if (drawHistory.length === 0) return
    
    // Remove the last item from history
    const newHistory = drawHistory.slice(0, -1)
    setDrawHistory(newHistory)
    
    // Redraw everything except the last item
    if (canvasRef.current) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      
      if (ctx) {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        
                 // Redraw all items except the last one
         newHistory.forEach(item => {
           if (item.type === 'circle' && item.data.center && item.data.radius) {
             const { center, radius, color } = item.data
             const colorMap = { red: '#ff0000', blue: '#0066ff', yellow: '#ffdd00' }
             ctx.strokeStyle = colorMap[color]
             ctx.lineWidth = 3
             ctx.lineCap = 'round'
             ctx.beginPath()
             ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI)
             ctx.stroke()
           } else if (item.type === 'line' && item.data.start && item.data.end) {
             const { start, end, color } = item.data
             const colorMap = { red: '#ff0000', blue: '#0066ff', yellow: '#ffdd00' }
             ctx.strokeStyle = colorMap[color]
             ctx.lineWidth = 3
             ctx.lineCap = 'round'
             ctx.beginPath()
             ctx.moveTo(start.x, start.y)
             ctx.lineTo(end.x, end.y)
             ctx.stroke()
           } else if (item.type === 'polyline' && item.data.points) {
             const { points, color } = item.data
             const colorMap = { red: '#ff0000', blue: '#0066ff', yellow: '#ffdd00' }
             ctx.strokeStyle = colorMap[color]
             ctx.lineWidth = 3
             ctx.lineCap = 'round'
             
             // Draw polyline segments
             for (let i = 0; i < points.length - 1; i++) {
               ctx.beginPath()
               ctx.moveTo(points[i].x, points[i].y)
               ctx.lineTo(points[i + 1].x, points[i + 1].y)
               ctx.stroke()
             }
           }
         })
      }
    }
  }

  const saveMarkupImage = async () => {
    if (!canvasRef.current || !imageRef.current || !capture_url) return null
    
    setIsSaving(true)
    try {
      const markupCanvas = canvasRef.current
      const img = imageRef.current
      
      // Generate filename with _Mark suffix
      const originalUrl = capture_url as string
      const filename = originalUrl.split('/').pop() || ''
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')
      const extension = filename.includes('.') ? filename.split('.').pop() : 'jpg'
      const markupFilename = `${nameWithoutExt}_Mark.${extension}`
      
      console.log('Creating markup image with filename:', markupFilename)
      
      // Create a composite image by loading the image without CORS issues
      const tempCanvas = document.createElement('canvas')
      const tempCtx = tempCanvas.getContext('2d')
      
      if (!tempCtx) {
        setIsSaving(false)
        return null
      }
      
      // Set canvas size to match original image dimensions
      tempCanvas.width = img.naturalWidth
      tempCanvas.height = img.naturalHeight
      
      // Create a new image element for loading without CORS taint
      const cleanImg = new Image()
      cleanImg.crossOrigin = 'anonymous'
      
      return new Promise<string | null>((resolve) => {
        cleanImg.onload = async () => {
          try {
            // Draw the original image to the temp canvas
            tempCtx.drawImage(cleanImg, 0, 0)
            
            // Then draw the markup overlay scaled to the natural size
            const scaleX = img.naturalWidth / markupCanvas.width
            const scaleY = img.naturalHeight / markupCanvas.height
            
            tempCtx.save()
            tempCtx.scale(scaleX, scaleY)
            tempCtx.drawImage(markupCanvas, 0, 0)
            tempCtx.restore()
            
            // Convert to data URL
            const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.9)
            
            // Upload to backend
            console.log('Uploading markup image to backend...')
            const formData = new FormData()
            formData.append('image_data', dataUrl)
            formData.append('filename', markupFilename)
            formData.append('original_url', originalUrl)
            
            try {
              const uploadResponse = await fetch('/api/v1/upload-markup-image', {
                method: 'POST',
                body: formData
              })
              
              if (uploadResponse.ok) {
                const uploadResult = await uploadResponse.json()
                console.log('Markup image uploaded successfully:', uploadResult)
                
                // Try to store the markup image data in localStorage as backup (optional)
                try {
                  const markupImageKey = `markup_${markupFilename}`
                  localStorage.setItem(markupImageKey, dataUrl)
                } catch (storageError) {
                  console.warn('Could not store markup image in localStorage (quota exceeded):', storageError)
                }
                
                // Return the uploaded image URL (always return this even if localStorage fails)
                console.log('Successfully uploaded markup image to backend:', uploadResult.image_url)
                setIsSaving(false)
                resolve(uploadResult.image_url)
              } else {
                console.error('Failed to upload markup image:', uploadResponse.statusText)
                const errorText = await uploadResponse.text()
                console.error('Upload error response:', errorText)
                
                // Fallback to localStorage only
                const markupImageKey = `markup_${markupFilename}`
                localStorage.setItem(markupImageKey, dataUrl)
                const markupReference = `markup://${markupFilename}`
                setIsSaving(false)
                resolve(markupReference)
              }
            } catch (uploadError) {
              console.error('Upload request failed (server may be down):', uploadError)
              
              // Fallback to localStorage only when API server is unreachable
              try {
                const markupImageKey = `markup_${markupFilename}`
                localStorage.setItem(markupImageKey, dataUrl)
                const markupReference = `markup://${markupFilename}`
                console.log('Using localStorage fallback due to API error:', markupReference)
                setIsSaving(false)
                resolve(markupReference)
              } catch (storageError) {
                console.error('Both upload and localStorage failed:', storageError)
                setIsSaving(false)
                resolve(null)
              }
            }
          } catch (error) {
            console.error('Error creating composite image:', error)
            setIsSaving(false)
            resolve(null)
          }
        }
        
        cleanImg.onerror = () => {
          console.error('Failed to load clean image for composite')
          setIsSaving(false)
          resolve(null)
        }
        
        // Use proxy URL to avoid CORS issues
        const proxyUrl = `/api/v1/proxy-file/${encodeURIComponent(originalUrl)}`
        cleanImg.src = proxyUrl
        console.log('Using proxy URL for new markup to avoid CORS:', proxyUrl)
      })
      
    } catch (error) {
      console.error('Error saving markup image:', error)
      setIsSaving(false)
      return null
    }
  }

  const handleSaveAndBack = async () => {
    const markupImageUrl = await saveMarkupImage()
    console.log('Markup image URL from saveMarkupImage:', markupImageUrl)
    
    // 新しいアドバイス作成フローから来た場合は、マークアップ後の画像URLを保存
    const returnStep = localStorage.getItem('advice_new_return_step')
    console.log('Return step:', returnStep)
    console.log('Markup image URL to save:', markupImageUrl)
    
    if (returnStep === 'captured' && markupImageUrl) {
      console.log('Saving markup image URL for advice new flow:', markupImageUrl)
      const savedFlowState = localStorage.getItem('advice_new_flow_state')
      if (savedFlowState) {
        try {
          const flowState = JSON.parse(savedFlowState)
          console.log('Original flow state:', flowState)
          
          // マークアップ後の画像URLで更新
          const updatedCaptureResult = {
            ...flowState.captureResult,
            url: markupImageUrl,
            sasUrl: markupImageUrl
          }
          
          flowState.captureResult = updatedCaptureResult
          localStorage.setItem('advice_new_flow_state', JSON.stringify(flowState))
          console.log('Updated flow state with markup image:', updatedCaptureResult)
          
          // 確認のため、保存されたデータを読み直して表示
          const verifyFlowState = localStorage.getItem('advice_new_flow_state')
          if (verifyFlowState) {
            const verifyData = JSON.parse(verifyFlowState)
            console.log('Verified saved flow state:', verifyData.captureResult)
          }
        } catch (error) {
          console.error('Error updating flow state with markup image:', error)
        }
      } else {
        console.log('No saved flow state found')
      }
    } else {
      console.log('Not saving markup image - returnStep:', returnStep, 'markupImageUrl:', markupImageUrl)
    }
    
    // Allow saving even if markupImageUrl is null (for localStorage fallback scenario)
    if (video_id && phase && typeof video_id === 'string' && typeof phase === 'string') {
      // Update advices with new markup image URL
      try {
        // Add timestamp to prevent caching
        const timestamp = Date.now()
        
        // Get current advices from API first, fallback to localStorage
        let parsedAdvices = []
        try {
          const response = await fetch(`/api/v1/get-advices/${video_id}?_t=${timestamp}`)
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
        
        // Find existing advice for this phase or create new one
        let existingAdviceIndex = parsedAdvices.findIndex((advice: any) => advice.phase === phase)
        
        if (existingAdviceIndex >= 0) {
          // Update existing advice with latest markup image URL
          parsedAdvices[existingAdviceIndex] = {
            ...parsedAdvices[existingAdviceIndex],
            captureUrl: markupImageUrl,
            captureSasUrl: markupImageUrl,
            lastUpdated: timestamp // Add timestamp for tracking
          }
        } else {
          // マークアップページでは新しいアドバイスを作成しない
          // アドバイス作成フローから来た場合のみ対応
        }
        
        // Save to API with retry mechanism
        let saveAttempts = 0
        let saveSuccess = false
        
        while (saveAttempts < 3 && !saveSuccess) {
          try {
            const saveResponse = await fetch(`/api/v1/save-advices/${video_id}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(parsedAdvices)
            })
            
            if (saveResponse.ok) {
              saveSuccess = true
              
              // Also save to localStorage as backup
              localStorage.setItem(`advices_${video_id}`, JSON.stringify(parsedAdvices))
              
              // Clear localStorage cache for this video to force refresh
              localStorage.removeItem(`advices_cache_${video_id}`)
              
            } else {
              saveAttempts++
            }
          } catch (saveError) {
            saveAttempts++
          }
        }
        
        if (!saveSuccess) {
          localStorage.setItem(`advices_${video_id}`, JSON.stringify(parsedAdvices))
        }
        
        // Verify the save by fetching the data again
        try {
          const verifyResponse = await fetch(`/api/v1/get-advices/${video_id}?_t=${Date.now()}`)
          if (verifyResponse.ok) {
            const verifyData = await verifyResponse.json()
            const savedAdvice = verifyData.advices?.find((advice: any) => advice.phase === phase)
            if (savedAdvice && savedAdvice.captureUrl === markupImageUrl) {
            } else {
              console.warn('Verification failed: Saved data may not match expected values')
            }
          }
        } catch (verifyError) {
          console.warn('Verification check failed:', verifyError)
        }
        
        // Show success message
        alert('マークアップ画像が正常に保存されました！')
      } catch (error) {
        console.error('Error updating advices:', error)
        alert('保存中にエラーが発生しました。')
      }
    } else {
      console.log('Missing parameters:', { markupImageUrl, video_id, phase })
      alert('保存に必要なパラメータが不足しています。')
    }
    // 新しいアドバイス作成画面から来た場合は、そこに戻る
    const returnUrl = localStorage.getItem('advice_new_return_url')
    if (returnUrl) {
      router.push(returnUrl)
    } else {
      // Always go back to the advice list page
      router.push(`/coach/advice?video_id=${video_id}`)
    }
  }

  const getPhaseCode = (phaseName: string): string => {
    const phaseMap: { [key: string]: string } = {
      'アドレス': 'F1',
      'バックスイング': 'F2',
      'トップ': 'F3',
      'ダウンスイング': 'F4',
      'インパクト': 'F5',
      'フォロースルー': 'F6',
      'フィニッシュ': 'F7'
    }
    return phaseMap[phaseName] || 'F1'
  }

  const handleBack = () => {
    // 新しいアドバイス作成画面から来た場合は、そこに戻る
    const returnUrl = localStorage.getItem('advice_new_return_url')
    if (returnUrl) {
      router.push(returnUrl)
    } else {
      router.back()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">画像を読み込み中...</p>
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
              <h1 className="text-3xl font-bold text-gray-900">マークアップ</h1>
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
          {/* Tool Buttons */}
          <div className="space-y-4 mb-6">
            {/* Shape Selection */}
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700 min-w-0">図形:</span>
              <button
                onClick={() => setCurrentTool('circle')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  currentTool === 'circle'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="text-xl">○</span>
                <span>円</span>
              </button>
              <button
                onClick={() => setCurrentTool('line')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  currentTool === 'line'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="text-xl">/</span>
                <span>直線</span>
              </button>
              <button
                onClick={() => setCurrentTool('polyline')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  currentTool === 'polyline'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="text-xl">∠</span>
                <span>折れ線</span>
              </button>
            </div>

            {/* Color Selection */}
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700 min-w-0">色:</span>
              <button
                onClick={() => setCurrentColor('red')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  currentColor === 'red'
                    ? 'bg-red-500 text-white border-red-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-red-500"></span>
                <span>赤</span>
              </button>
              <button
                onClick={() => setCurrentColor('blue')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  currentColor === 'blue'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-blue-600"></span>
                <span>青</span>
              </button>
              <button
                onClick={() => setCurrentColor('yellow')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  currentColor === 'yellow'
                    ? 'bg-yellow-500 text-white border-yellow-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-yellow-500"></span>
                <span>黄</span>
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-4">
              <button
                onClick={clearLastItem}
                disabled={drawHistory.length === 0}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  drawHistory.length === 0
                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                }`}
              >
                ひとつクリア
              </button>
              <button
                onClick={clearCanvas}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                クリア
              </button>
              <button
                onClick={handleSaveAndBack}
                disabled={isSaving}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  isSaving
                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                    : 'bg-green-500 text-white hover:bg-green-600'
                }`}
              >
                {isSaving ? '保存中...' : 'マークアップを保存して戻る'}
              </button>
            </div>
          </div>

          {/* Canvas Area */}
          <div className="flex justify-center">
            <div className="relative max-w-full inline-block">
              {imageSasUrl && (
                <div className="relative inline-block">
                  <img
                    ref={imageRef}
                    src={imageSasUrl}
                    alt={`${phase}キャプチャ画像`}
                    className="max-w-full h-auto block"
                    onLoad={handleImageLoad}
                    onError={(e) => {
                      console.error('Image load error:', e)
                      console.error('Failed image URL:', imageSasUrl)
                      setImageError(`画像の読み込みに失敗しました: ${imageSasUrl}`)
                      setLoading(false)
                    }}
                    style={{ pointerEvents: 'none' }}
                    crossOrigin="anonymous"
                  />
                  {imageLoaded && (
                    <canvas
                      ref={canvasRef}
                      className="absolute top-0 left-0 cursor-crosshair"
                      onMouseDown={handlePointerStart}
                      onMouseUp={handlePointerEnd}
                      onMouseMove={(e) => {
                        // Ensure cursor stays crosshair throughout the canvas
                        e.currentTarget.style.cursor = 'crosshair'
                      }}
                      onTouchStart={handlePointerStart}
                      onTouchEnd={handlePointerEnd}
                      style={{ 
                        pointerEvents: 'auto',
                        zIndex: 10
                      }}
                    />
                  )}
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

          {/* Polyline Progress Info */}
          {currentTool === 'polyline' && polylinePoints.length > 0 && (
            <div className="mt-2 p-2 bg-blue-100 rounded text-xs">
              <p>折れ線描画進行状況:</p>
              <p>ポイント数: {polylinePoints.length}/3</p>
              <p>次の操作: {polylinePoints.length === 1 ? '中間点をクリック' : '終点をクリック'}</p>
            </div>
          )}

          {/* Instructions */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">使い方</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• 円ツール: 中心点をクリック/タッチしてドラッグで円を描画</li>
              <li>• 直線ツール: 始点をクリック/タッチしてドラッグで直線を描画</li>
              <li>• 折れ線ツール: 1回クリックで始点決定→2回目で中間点決定→3回目で終点決定。2回目クリック時に始点と中間点を結ぶ直線が自動描画</li>
              <li>• ひとつクリアボタンで最新の描画を一つずつ削除</li>
              <li>• クリアボタンで全ての描画を消去</li>
              <li>• PC: マウス操作、スマホ: タッチ操作に対応</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { formatUploadDate } from '../../utils/dateFormat'

interface VideoData {
  video_id: string
  video_url: string
  thumbnail_url?: string
  upload_date: string
  club_type?: string
  swing_form?: string
  swing_note?: string
  user_id: string
}

interface MediaUrlResponse {
  url: string
}

export default function NewAdviceCreation() {
  const router = useRouter()
  const { video_id } = router.query
  const videoRef = useRef<HTMLVideoElement>(null)
  
  const [videoData, setVideoData] = useState<VideoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [videoSasUrl, setVideoSasUrl] = useState<string>('')
  
  // Video player states
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  
  // Tag selection state
  const [selectedPhase, setSelectedPhase] = useState<string>('')
  const [isCaptured, setIsCaptured] = useState(false)
  const [captureResult, setCaptureResult] = useState<{url: string, sasUrl: string} | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  
  // Voice and comment input states
  const [isVoiceInputMode, setIsVoiceInputMode] = useState(false)
  const [comment, setComment] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [isCommentCompleted, setIsCommentCompleted] = useState(false)
  


  // Swing phases with identification codes
  const swingPhases = [
    { name: 'アドレス', code: 'AD' },
    { name: 'テイクバック', code: 'TB' }, 
    { name: 'バックスイング', code: 'BS' },
    { name: 'トップ', code: 'TP' },
    { name: 'トランジション', code: 'TR' },
    { name: 'ダウンスイング', code: 'DS' },
    { name: 'インパクト', code: 'IM' },
    { name: 'フォロー', code: 'FO' },
    { name: 'フィニッシュ１', code: 'F1' },
    { name: 'フィニッシュ２', code: 'F2' },
    { name: 'その他', code: 'OT' }
  ]

  useEffect(() => {
    const loadData = async () => {
      if (video_id && typeof video_id === 'string') {
        await fetchVideoData(video_id)
      }
    }
    loadData()
  }, [video_id])

  useEffect(() => {
    // マークアップページから戻った時の処理
    const returnStep = localStorage.getItem('advice_new_return_step')
    if (returnStep === 'captured') {
      // 保存されたフロー状態を復元
      const savedFlowState = localStorage.getItem('advice_new_flow_state')
      if (savedFlowState) {
        try {
          const flowState = JSON.parse(savedFlowState)
          setSelectedPhase(flowState.selectedPhase || '')
          setCaptureResult(flowState.captureResult || null)
          setIsCaptured(true)
          setComment(flowState.comment || '')
          setIsCommentCompleted(flowState.isCommentCompleted || false)
          localStorage.removeItem('advice_new_flow_state')
          
                     // マークアップページで保存された画像を再読み込み
           if (flowState.captureResult) {
             console.log('Restoring capture result from markup:', flowState.captureResult)
             
             // マークアップ後の画像URLを直接使用
             const markupImageUrl = flowState.captureResult.url
             console.log('Markup image URL:', markupImageUrl)
             
             if (markupImageUrl) {
               // markup://形式の場合はlocalStorageから取得
               if (markupImageUrl.startsWith('markup://')) {
                 const filename = markupImageUrl.replace('markup://', '')
                 const markupImageKey = `markup_${filename}`
                 const storedDataUrl = localStorage.getItem(markupImageKey)
                 console.log('Found markup image in localStorage:', !!storedDataUrl)
                 
                 if (storedDataUrl) {
                   console.log('Setting markup image from localStorage')
                   setCaptureResult({
                     url: markupImageUrl,
                     sasUrl: storedDataUrl
                   })
                 } else {
                   console.log('No markup image found in localStorage, using fallback')
                   setCaptureResult({
                     url: markupImageUrl,
                     sasUrl: flowState.captureResult.sasUrl || markupImageUrl
                   })
                 }
               } else {
                 // バックエンドにアップロードされた画像の場合
                 console.log('Setting markup image from backend URL:', markupImageUrl)
                 // SAS URLを取得して表示
                 setTimeout(() => {
                   getSasUrlForImage(markupImageUrl).then(sasUrl => {
                     if (sasUrl) {
                       console.log('Got SAS URL for markup image:', sasUrl)
                       setCaptureResult({
                         url: markupImageUrl,
                         sasUrl: sasUrl
                       })
                     } else {
                       console.log('Using original URL for markup image')
                       setCaptureResult({
                         url: markupImageUrl,
                         sasUrl: markupImageUrl
                       })
                     }
                   })
                 }, 500)
               }
             } else {
               console.log('No markup image URL found, using original capture result')
               // 従来の方法でSAS URLを取得
               setTimeout(() => {
                 getSasUrlForImage(flowState.captureResult.url).then(sasUrl => {
                   if (sasUrl) {
                     setCaptureResult({
                       ...flowState.captureResult,
                       sasUrl: sasUrl
                     })
                   }
                 })
               }, 500)
             }
           }
        } catch (error) {
          console.error('Error parsing flow state:', error)
        }
      }
      localStorage.removeItem('advice_new_return_step')
      localStorage.removeItem('advice_new_return_url')
    }
  }, [])

  const fetchVideoData = async (videoId: string) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/v1/upload-status/${videoId}`)
      if (response.ok) {
        const data = await response.json()
        setVideoData(data)
        
        // SAS付きURLを取得
        await fetchMediaUrls(data.video_url)
      } else if (response.status === 404) {
        setError('動画が見つかりません')
      } else {
        setError('動画データの取得に失敗しました')
      }
    } catch (err) {
      setError('動画データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const fetchMediaUrls = async (videoUrl: string) => {
    try {
      // 動画のSAS URLを取得
      if (videoUrl) {
        const videoResponse = await fetch(`/api/v1/media-url?blob_url=${encodeURIComponent(videoUrl)}`)
        if (videoResponse.ok) {
          const videoData: MediaUrlResponse = await videoResponse.json()
          setVideoSasUrl(videoData.url)
        }
      }
    } catch (error) {
      console.error('メディアURL取得エラー:', error)
    }
  }

  // Video player event handlers
  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
    }
  }

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }

  const handleVideoPlay = () => {
    setIsPlaying(true)
  }

  const handleVideoPause = () => {
    setIsPlaying(false)
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value)
    setCurrentTime(newTime)
    if (videoRef.current) {
      videoRef.current.currentTime = newTime
    }
  }

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
    }
  }

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    const milliseconds = Math.floor((time % 1) * 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`
  }

  const extractUserNumber = (url: string): string => {
    const filename = url.split('/').pop() || ''
    const match = filename.match(/_U(\d+)/)
    return match ? `U${match[1]}` : 'U-----'
  }

  const handlePhaseSelect = (phase: string) => {
    setSelectedPhase(phase)
  }

  const getPhaseCode = (phaseName: string): string => {
    const phase = swingPhases.find(p => p.name === phaseName)
    return phase ? phase.code : 'OT'
  }

  const getSasUrlForImage = async (imageUrl: string): Promise<string | null> => {
    try {
      const response = await fetch(`/api/v1/media-url?blob_url=${encodeURIComponent(imageUrl)}`)
      if (response.ok) {
        const data: MediaUrlResponse = await response.json()
        return data.url
      }
    } catch (error) {
      console.error('画像SAS URL取得エラー:', error)
    }
    return null
  }

  const captureVideoFrame = async (): Promise<{url: string, sasUrl: string} | null> => {
    if (!videoData || !videoSasUrl) return null

    try {
      setIsCapturing(true)
      
      // Extract base filename from video URL
      const videoUrl = videoData.video_url
      const videoFilename = videoUrl.split('/').pop() || ''
      const baseName = videoFilename.replace(/\.[^/.]+$/, '') // Remove extension
      const phaseCode = getPhaseCode(selectedPhase)
      const captureFilename = `${baseName}_${phaseCode}.jpg`

      // Capture frame using backend API
      const response = await fetch('/api/v1/capture-video-frame', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          video_url: videoSasUrl,
          time_seconds: currentTime.toString(),
          filename: captureFilename
        })
      })

      if (response.ok) {
        const data = await response.json()
        const sasUrl = await getSasUrlForImage(data.image_url)
        return {
          url: data.image_url,
          sasUrl: sasUrl || data.image_url
        }
      } else {
        return null
      }
    } catch (error) {
      console.error('キャプチャエラー:', error)
      return null
    } finally {
      setIsCapturing(false)
    }
  }

  const handleCapture = async () => {
    if (!selectedPhase) {
      alert('タグを選択してください')
      return
    }

    const result = await captureVideoFrame()
    if (result) {
      setCaptureResult(result)
      setIsCaptured(true)
    } else {
      alert('キャプチャに失敗しました')
    }
  }

  const handleMarkup = () => {
    if (captureResult) {
      // 現在のフロー状態を保存
      const flowState = {
        selectedPhase,
        captureResult,
        currentTime,
        comment,
        isCommentCompleted
      }
      localStorage.setItem('advice_new_flow_state', JSON.stringify(flowState))
      localStorage.setItem('advice_new_return_step', 'captured')
      localStorage.setItem('advice_new_return_url', `/coach/advice-new?video_id=${video_id}`)
      router.push(`/coach/markup?video_id=${video_id}&phase=${encodeURIComponent(selectedPhase)}&capture_url=${encodeURIComponent(captureResult.url)}`)
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/wav' })
        
        if (audioBlob.size < 1000) {
          alert('録音データが短すぎるか、音声が検出されませんでした。マイクの設定を確認して、もう一度試してください。')
          stream.getTracks().forEach(track => track.stop())
          return
        }
        
        await transcribeAudio(audioBlob)
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop())
      }

      setMediaRecorder(recorder)
      setIsRecording(true)
      recorder.start()
    } catch (error) {
      console.error('Error starting recording:', error)
      alert('マイクへのアクセスに失敗しました。ブラウザの設定を確認してください。')
    }
  }

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop()
      setMediaRecorder(null)
      setIsRecording(false)
    }
  }

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.wav')
      formData.append('type', 'phase_advice')

      const response = await fetch('/api/v1/transcribe-audio', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        
        if (data.success === false) {
          alert(data.transcription || '音声の文字起こしに失敗しました。')
          return
        }
        
        setTranscription(data.transcription)
      } else {
        const errorText = await response.text()
        alert('音声の文字起こしに失敗しました。サーバーエラー: ' + response.status)
      }
    } catch (error) {
      alert('音声の文字起こし中にエラーが発生しました。ネットワークエラーまたはサーバーが応答していません。')
    }
  }

  const handleVoiceInput = () => {
    setIsVoiceInputMode(true)
    setComment('')
    setTranscription('')
    setIsCommentCompleted(false)
  }

  const handleAddToComment = () => {
    setComment(prev => prev + (prev ? '\n\n' : '') + transcription)
    setTranscription('')
  }

  const handleCompleteInput = () => {
    if (comment.trim()) {
      setIsCommentCompleted(true)
      setIsVoiceInputMode(false)
    } else {
      alert('コメントを入力してください')
    }
  }

  const handleCancelVoiceInput = () => {
    setIsVoiceInputMode(false)
    setComment('')
    setTranscription('')
    setIsCommentCompleted(false)
  }

  const handleCancelCapture = () => {
    setIsCaptured(false)
    setCaptureResult(null)
    setSelectedPhase('')
  }

  const handleSaveAdvice = async () => {
    if (!selectedPhase || !captureResult || !comment.trim()) {
      alert('アドバイスを保存するには、タグ、キャプチャ画像、コメントが必要です')
      return
    }

    try {
      // 新しいアドバイスオブジェクトを作成
      const newAdvice = {
        id: Date.now().toString(), // 一時的なID
        phase: selectedPhase,
        phaseCode: getPhaseCode(selectedPhase),
        captureUrl: captureResult.url,
        captureSasUrl: captureResult.sasUrl,
        comment: comment,
        timestamp: currentTime,
        createdAt: new Date().toISOString(),
        isConfirmed: false
      }

      // 既存のアドバイスを取得
      let existingAdvices = []
      try {
        const response = await fetch(`/api/v1/get-advices/${video_id}`)
        if (response.ok) {
          const data = await response.json()
          existingAdvices = data.advices || []
        }
      } catch (error) {
        console.error('既存アドバイス取得エラー:', error)
        // localStorageから取得を試行
        const saved = localStorage.getItem(`advices_${video_id}`)
        if (saved) {
          existingAdvices = JSON.parse(saved)
        }
      }

      // 新しいアドバイスを追加
      existingAdvices.push(newAdvice)

      // バックエンドに保存
      try {
        const saveResponse = await fetch(`/api/v1/save-advices/${video_id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(existingAdvices)
        })

        if (saveResponse.ok) {
          // localStorageにも保存
          localStorage.setItem(`advices_${video_id}`, JSON.stringify(existingAdvices))
          
          // アドバイス入力画面に戻る
          router.push(`/coach/advice?video_id=${video_id}`)
        } else {
          throw new Error('バックエンド保存に失敗')
        }
      } catch (error) {
        console.error('バックエンド保存エラー:', error)
        // localStorageのみに保存
        localStorage.setItem(`advices_${video_id}`, JSON.stringify(existingAdvices))
        alert('アドバイスを保存しました（ローカル保存）')
        router.push(`/coach/advice?video_id=${video_id}`)
      }
    } catch (error) {
      console.error('アドバイス保存エラー:', error)
      alert('アドバイスの保存に失敗しました')
    }
  }

  const handleCancel = () => {
    router.push(`/coach/advice?video_id=${video_id}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">動画データを読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error || !videoData) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <p className="text-red-600 mb-4">{error || '動画データが見つかりません'}</p>
          <Link href="/coach" className="text-blue-500 hover:text-blue-700">
            ← コーチ画面に戻る
          </Link>
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
              <h1 className="text-3xl font-bold text-gray-900">新しいアドバイス作成</h1>
              <p className="text-gray-600 mt-1">
                ユーザー: {extractUserNumber(videoData.video_url)} | 
                アップロード: {videoData.upload_date ? formatUploadDate(videoData.upload_date) : '読み込み中...'}
              </p>
            </div>
            <Link href={`/coach/advice?video_id=${video_id}`} className="text-blue-600 hover:text-blue-700">
              ← アドバイス入力に戻る
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">動画分析</h2>
          
          {/* Video Player */}
          <div className="aspect-video bg-gray-200 rounded-lg mb-4 overflow-hidden">
            {videoSasUrl ? (
              <video
                ref={videoRef}
                className="w-full h-full"
                src={videoSasUrl}
                onLoadedMetadata={handleVideoLoadedMetadata}
                onTimeUpdate={handleVideoTimeUpdate}
                onPlay={handleVideoPlay}
                onPause={handleVideoPause}
                controls
              >
                お使いのブラウザは動画の再生に対応していません。
              </video>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <div className="text-4xl mb-2">📹</div>
                  <p>動画を読み込み中...</p>
                </div>
              </div>
            )}
          </div>

          {/* Video Timeline Slider */}
          {duration > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">再生位置</span>
                <span className="text-sm text-gray-600">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={togglePlayPause}
                  className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                >
                  {isPlaying ? '⏸️' : '▶️'}
                </button>
                <input
                  type="range"
                  min="0"
                  max={duration}
                  step="0.1"
                  value={currentTime}
                  onChange={handleSliderChange}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>
              <div className="text-xs text-gray-500 mt-1">
                スライダーで動画の任意の位置にジャンプできます
              </div>
            </div>
          )}

                     {/* Tag Selection or Selected Tag Display */}
           <div className="mb-6">
             {!isCaptured ? (
               <>
                 <h3 className="text-lg font-medium text-gray-800 mb-3">タグ選択</h3>
                 <div className="grid grid-cols-2 gap-2">
                   {swingPhases.map((phase) => (
                     <button
                       key={phase.name}
                       onClick={() => handlePhaseSelect(phase.name)}
                       className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                         selectedPhase === phase.name
                           ? 'bg-blue-500 text-white border-blue-500'
                           : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                       }`}
                     >
                       {phase.name}
                     </button>
                   ))}
                 </div>
               </>
             ) : (
               <>
                 <h3 className="text-lg font-medium text-gray-800 mb-3">選択されたタグ</h3>
                 <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                   <div className="flex items-center justify-between">
                     <span className="text-blue-800 font-medium">{selectedPhase}</span>
                     <span className="text-sm text-blue-600">{formatTime(currentTime)}</span>
                   </div>
                 </div>
               </>
             )}
           </div>

                       {/* Capture Image Display */}
            {isCaptured && captureResult && (
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-800 mb-3">キャプチャ画像</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="w-full max-w-md mx-auto">
                    <img
                      src={captureResult.sasUrl || `/api/v1/proxy-file/${encodeURIComponent(captureResult.url)}`}
                      alt={`${selectedPhase}キャプチャ`}
                      className="w-full h-auto rounded border"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        if (!target.src.includes('proxy-file')) {
                          target.src = `/api/v1/proxy-file/${encodeURIComponent(captureResult.url)}`
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Comment Display */}
            {isCommentCompleted && comment && (
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-800 mb-3">コメント</h3>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-blue-800 whitespace-pre-wrap">{comment}</div>
                </div>
              </div>
            )}

            {/* Voice and Comment Input Mode */}
            {isVoiceInputMode && (
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-800 mb-3">音声・コメント入力</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                  {/* Recording Controls */}
                  <div className="flex items-center gap-4">
                    {!isRecording ? (
                      <button
                        onClick={startRecording}
                        className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors text-sm"
                      >
                        🎤 録音開始
                      </button>
                    ) : (
                      <button
                        onClick={stopRecording}
                        className="bg-red-700 text-white px-4 py-2 rounded-lg hover:bg-red-800 transition-colors text-sm animate-pulse"
                      >
                        ⏹️ 録音終了
                      </button>
                    )}
                    <span className="text-sm text-gray-600">音声でアドバイスを入力してください</span>
                  </div>

                  {/* Transcription Result */}
                  {transcription && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-2">
                        文字起こし結果
                      </label>
                      <div className="w-full min-h-[4rem] px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-800 whitespace-pre-wrap text-sm mb-2">
                        {transcription}
                      </div>
                      <button
                        onClick={handleAddToComment}
                        className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition-colors"
                      >
                        コメントに追加
                      </button>
                    </div>
                  )}

                  {/* Comment Input */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      コメント入力
                    </label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="アドバイス内容を入力してください..."
                      className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm text-gray-800"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleCompleteInput}
                      disabled={!comment.trim()}
                      className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                        comment.trim()
                          ? 'bg-green-500 text-white hover:bg-green-600'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      入力完了
                    </button>
                    <button
                      onClick={handleCancelVoiceInput}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50 transition-colors"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              </div>
            )}

                       {/* Action Buttons */}
            <div className="flex gap-4">
              {!isCaptured ? (
                <>
                  <button
                    onClick={handleCapture}
                    disabled={!selectedPhase || isCapturing}
                    className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                      selectedPhase && !isCapturing
                        ? 'bg-green-500 text-white hover:bg-green-600'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {isCapturing ? 'キャプチャ中...' : 'キャプチャ'}
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex-1 py-3 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    キャンセル
                  </button>
                </>
              ) : (
                <>
                  {!isCommentCompleted ? (
                    <>
                      <button
                        onClick={handleMarkup}
                        className="flex-1 py-3 px-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
                      >
                        マークアップ
                      </button>
                      <button
                        onClick={handleVoiceInput}
                        className="flex-1 py-3 px-4 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors"
                      >
                        音声・コメント入力
                      </button>
                      <button
                        onClick={handleCancelCapture}
                        className="flex-1 py-3 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                      >
                        キャンセル
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleMarkup}
                        className="flex-1 py-3 px-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
                      >
                        マークアップ
                      </button>
                      <button
                        onClick={handleVoiceInput}
                        className="flex-1 py-3 px-4 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors"
                      >
                        音声・コメント入力
                      </button>
                                             <button
                         onClick={handleSaveAdvice}
                         className="flex-1 py-3 px-4 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors"
                       >
                         OK
                       </button>
                    </>
                  )}
                </>
              )}
            </div>
        </div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
        }
        
        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  )
} 
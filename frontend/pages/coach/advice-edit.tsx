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

export default function AdviceEdit() {
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
  
  // Edit states
  const [selectedPhase, setSelectedPhase] = useState<string>('')
  const [isCaptured, setIsCaptured] = useState(false)
  const [captureResult, setCaptureResult] = useState<{url: string, sasUrl: string} | null>(null)
  const [originalCaptureResult, setOriginalCaptureResult] = useState<{url: string, sasUrl: string} | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [originalAdviceId, setOriginalAdviceId] = useState<string>('')
  
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
        
        // 編集データの読み込み
        const editData = localStorage.getItem('advice_edit_data')
        if (editData) {
          try {
            const data = JSON.parse(editData)
            setOriginalAdviceId(data.originalAdviceId)
            setSelectedPhase(data.phase)
            const captureData = {
              url: data.captureUrl,
              sasUrl: data.captureSasUrl
            }
            setCaptureResult(captureData)
            setOriginalCaptureResult(captureData) // 元の画像を保存
            setIsCaptured(true)
            setComment(data.comment)
            setIsCommentCompleted(true)
            setCurrentTime(data.timestamp)
            
            // 動画を指定の時間に設定
            if (videoRef.current) {
              videoRef.current.currentTime = data.timestamp / 1000
            }
            
            // 編集データをクリア
            localStorage.removeItem('advice_edit_data')
          } catch (error) {
            console.error('編集データの読み込みエラー:', error)
          }
        }
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
               console.log('復元するフロー状態:', flowState)
               
                               setSelectedPhase(flowState.selectedPhase || '')
                setCaptureResult(flowState.captureResult || null)
                
                // 元の画像URLが保存されている場合は、それを使用して元の画像を設定
                if (flowState.originalImageUrl) {
                  console.log('フロー状態から元の画像URLを取得:', flowState.originalImageUrl)
                  // 元の画像のSAS URLを取得
                  getSasUrlForImage(flowState.originalImageUrl).then(sasUrl => {
                    const originalImage = {
                      url: flowState.originalImageUrl,
                      sasUrl: sasUrl || flowState.originalImageUrl
                    }
                    setOriginalCaptureResult(originalImage)
                    console.log('元の画像を設定:', originalImage)
                  }).catch(error => {
                    console.error('元の画像のSAS URL取得エラー:', error)
                    const originalImage = {
                      url: flowState.originalImageUrl,
                      sasUrl: flowState.originalImageUrl
                    }
                    setOriginalCaptureResult(originalImage)
                    console.log('元の画像を設定（SAS URL取得失敗）:', originalImage)
                  })
                } else if (!originalCaptureResult && flowState.captureResult) {
                  console.log('元の画像を設定:', flowState.captureResult)
                  setOriginalCaptureResult(flowState.captureResult)
                }
               
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
                   const markupImage = {
                     url: markupImageUrl,
                     sasUrl: storedDataUrl
                   }
                   setCaptureResult(markupImage)
                   // 元の画像が設定されていない場合は、フロー状態の元の画像を保存
                   if (!originalCaptureResult) {
                     console.log('元の画像をフロー状態から設定:', flowState.captureResult)
                     setOriginalCaptureResult(flowState.captureResult)
                   }
                 } else {
                   console.log('No markup image found in localStorage, using fallback')
                   const markupImage = {
                     url: markupImageUrl,
                     sasUrl: flowState.captureResult.sasUrl || markupImageUrl
                   }
                   setCaptureResult(markupImage)
                   // 元の画像が設定されていない場合は、フロー状態の元の画像を保存
                   if (!originalCaptureResult) {
                     console.log('元の画像をフロー状態から設定:', flowState.captureResult)
                     setOriginalCaptureResult(flowState.captureResult)
                   }
                 }
              } else {
                // バックエンドにアップロードされた画像の場合
                console.log('Setting markup image from backend URL:', markupImageUrl)
                // SAS URLを取得して表示
                setTimeout(() => {
                  getSasUrlForImage(markupImageUrl).then(sasUrl => {
                                         if (sasUrl) {
                       console.log('Got SAS URL for markup image:', sasUrl)
                       const markupImage = {
                         url: markupImageUrl,
                         sasUrl: sasUrl
                       }
                       setCaptureResult(markupImage)
                       // 元の画像が設定されていない場合は、フロー状態の元の画像を保存
                       if (!originalCaptureResult) {
                         console.log('元の画像をフロー状態から設定:', flowState.captureResult)
                         setOriginalCaptureResult(flowState.captureResult)
                       }
                     } else {
                       console.log('Using original URL for markup image')
                       const markupImage = {
                         url: markupImageUrl,
                         sasUrl: markupImageUrl
                       }
                       setCaptureResult(markupImage)
                       // 元の画像が設定されていない場合は、フロー状態の元の画像を保存
                       if (!originalCaptureResult) {
                         console.log('元の画像をフロー状態から設定:', flowState.captureResult)
                         setOriginalCaptureResult(flowState.captureResult)
                       }
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
                     const updatedCaptureResult = {
                       ...flowState.captureResult,
                       sasUrl: sasUrl
                     }
                     setCaptureResult(updatedCaptureResult)
                     // 元の画像が設定されていない場合は、フロー状態の元の画像を保存
                     if (!originalCaptureResult) {
                       console.log('元の画像をフロー状態から設定:', flowState.captureResult)
                       setOriginalCaptureResult(flowState.captureResult)
                     }
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

  const handleMarkup = () => {
    if (captureResult) {
      console.log('マークアップ実行 - 現在のcaptureResult:', captureResult)
      console.log('マークアップ実行 - originalCaptureResult:', originalCaptureResult)
      
      // 元の画像が設定されていない場合は、現在の画像を元の画像として保存
      if (!originalCaptureResult) {
        console.log('元の画像を現在の画像で設定:', captureResult)
        setOriginalCaptureResult(captureResult)
      }
      
      // 現在のフロー状態を保存（元の画像URLも含める）
      const flowState = {
        selectedPhase,
        captureResult,
        originalImageUrl: captureResult.url, // 元の画像URLを保存
        currentTime,
        comment,
        isCommentCompleted
      }
      localStorage.setItem('advice_new_flow_state', JSON.stringify(flowState))
      localStorage.setItem('advice_new_return_step', 'captured')
      localStorage.setItem('advice_new_return_url', `/coach/advice-edit?video_id=${video_id}`)
      router.push(`/coach/markup?video_id=${video_id}&phase=${encodeURIComponent(selectedPhase)}&capture_url=${encodeURIComponent(captureResult.url)}`)
    }
  }

  const handleMarkupClear = () => {
    console.log('マークアップクリア実行 - 現在のcaptureResult:', captureResult)
    console.log('マークアップクリア実行 - originalCaptureResult:', originalCaptureResult)
    
    if (captureResult) {
      // 現在の画像URLから元の画像URLを生成
      const originalImageUrl = generateOriginalImageUrl(captureResult.url)
      console.log('生成された元の画像URL:', originalImageUrl)
      
      if (originalImageUrl) {
        // 元の画像のSAS URLを取得
        getSasUrlForImage(originalImageUrl).then(sasUrl => {
          const originalImage = {
            url: originalImageUrl,
            sasUrl: sasUrl || originalImageUrl
          }
          setCaptureResult(originalImage)
          console.log('マークアップをクリアしました:', originalImage)
          
          // フロー状態も更新
          const savedFlowState = localStorage.getItem('advice_new_flow_state')
          if (savedFlowState) {
            try {
              const flowState = JSON.parse(savedFlowState)
              flowState.captureResult = originalImage
              localStorage.setItem('advice_new_flow_state', JSON.stringify(flowState))
              console.log('フロー状態を元の画像で更新しました')
            } catch (error) {
              console.error('フロー状態の更新エラー:', error)
            }
          }
        }).catch(error => {
          console.error('元の画像のSAS URL取得エラー:', error)
          // SAS URL取得に失敗した場合は、元のURLをそのまま使用
          const originalImage = {
            url: originalImageUrl,
            sasUrl: originalImageUrl
          }
          setCaptureResult(originalImage)
          console.log('マークアップをクリアしました（SAS URL取得失敗）:', originalImage)
        })
      } else {
        console.warn('元の画像URLを生成できませんでした')
        alert('元の画像が見つかりません。')
      }
    } else {
      console.warn('現在のキャプチャ結果が見つかりません')
      alert('画像が見つかりません。')
    }
  }

  // マークアップ画像URLから元の画像URLを生成する関数
  const generateOriginalImageUrl = (markupImageUrl: string): string | null => {
    console.log('元の画像URL生成 - 入力URL:', markupImageUrl)
    
    // markup://形式の場合は、元の画像のURLを返す
    if (markupImageUrl.startsWith('markup://')) {
      // markup://形式の場合は、元の画像のURLを取得する必要がある
      // フロー状態から元の画像URLを取得
      const savedFlowState = localStorage.getItem('advice_new_flow_state')
      if (savedFlowState) {
        try {
          const flowState = JSON.parse(savedFlowState)
          if (flowState.originalImageUrl) {
            console.log('フロー状態から元の画像URLを取得:', flowState.originalImageUrl)
            return flowState.originalImageUrl
          }
        } catch (error) {
          console.error('フロー状態の解析エラー:', error)
        }
      }
      return null
    }
    
    // 通常のURLの場合、_Markを除去して元の画像URLを生成
    if (markupImageUrl.includes('_Mark.')) {
      const originalUrl = markupImageUrl.replace('_Mark.', '.')
      console.log('_Markを除去して元の画像URLを生成:', originalUrl)
      return originalUrl
    }
    
    // _Markが含まれていない場合は、そのまま返す
    console.log('_Markが含まれていないため、そのまま返す:', markupImageUrl)
    return markupImageUrl
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
    setTranscription('')
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
    setTranscription('')
  }

  const handleSaveAdvice = async () => {
    if (!selectedPhase || !captureResult || !comment.trim()) {
      alert('アドバイスを保存するには、タグ、キャプチャ画像、コメントが必要です')
      return
    }

    console.log('アドバイス保存実行 - 現在のcaptureResult:', captureResult)

    try {
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

      // 現在の画像URLが最新かどうかを確認し、必要に応じてSAS URLを更新
      let finalCaptureResult = captureResult
      if (captureResult.url.includes('_Mark.')) {
        // マークアップ画像の場合は、そのまま使用
        console.log('マークアップ画像を使用:', captureResult.url)
      } else {
        // 通常の画像の場合は、SAS URLを最新に更新
        try {
          const latestSasUrl = await getSasUrlForImage(captureResult.url)
          if (latestSasUrl) {
            finalCaptureResult = {
              url: captureResult.url,
              sasUrl: latestSasUrl
            }
            console.log('SAS URLを更新:', latestSasUrl)
          }
        } catch (error) {
          console.error('SAS URL更新エラー:', error)
        }
      }

      // 既存のアドバイスを更新
      const updatedAdvices = existingAdvices.map(advice => 
        advice.id === originalAdviceId 
          ? {
              ...advice,
              phase: selectedPhase,
              phaseCode: getPhaseCode(selectedPhase),
              captureUrl: finalCaptureResult.url,
              captureSasUrl: finalCaptureResult.sasUrl,
              comment: comment,
              timestamp: currentTime,
              lastUpdated: Date.now() // 更新時刻を追加
            }
          : advice
      )

      // バックエンドに保存
      try {
        const saveResponse = await fetch(`/api/v1/save-advices/${video_id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatedAdvices)
        })

        if (saveResponse.ok) {
          // localStorageにも保存
          localStorage.setItem(`advices_${video_id}`, JSON.stringify(updatedAdvices))
          
          // アドバイス入力画面に戻る（リロードフラグ付き）
          router.push(`/coach/advice?video_id=${video_id}&reload=true`)
        } else {
          throw new Error('バックエンド保存に失敗')
        }
      } catch (error) {
        console.error('バックエンド保存エラー:', error)
        // localStorageのみに保存
        localStorage.setItem(`advices_${video_id}`, JSON.stringify(updatedAdvices))
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
              <h1 className="text-3xl font-bold text-gray-900">アドバイス編集</h1>
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

          {/* Tag Display */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-800 mb-3">タグ（編集不可）</h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-blue-800 font-medium">{selectedPhase}</span>
                <span className="text-sm text-blue-600">{formatTime(currentTime)}</span>
              </div>
            </div>
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
            {!isCommentCompleted ? (
              <>
                <button
                  onClick={handleMarkup}
                  className="flex-1 py-3 px-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
                >
                  マークアップ
                </button>
                <button
                  onClick={handleMarkupClear}
                  className="flex-1 py-3 px-4 bg-gray-500 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors"
                >
                  マークアップクリア
                </button>
                <button
                  onClick={handleVoiceInput}
                  className="flex-1 py-3 px-4 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors"
                >
                  音声・コメント入力
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
                <button
                  onClick={handleMarkup}
                  className="flex-1 py-3 px-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
                >
                  マークアップ
                </button>
                <button
                  onClick={handleMarkupClear}
                  className="flex-1 py-3 px-4 bg-gray-500 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors"
                >
                  マークアップクリア
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
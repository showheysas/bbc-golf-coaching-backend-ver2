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

interface Advice {
  id: string
  phase: string
  phaseCode: string
  captureUrl: string
  captureSasUrl: string
  comment: string
  timestamp: number
  createdAt: string
  isConfirmed: boolean
}

export default function CoachAdviceInput() {
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
  
  // Advice list state
  const [advices, setAdvices] = useState<Advice[]>([])
  const [loadingAdvices, setLoadingAdvices] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      if (video_id && typeof video_id === 'string') {
        await fetchVideoData(video_id)
        await loadAdvices()
        
        // リロードフラグが設定されている場合は、URLからクエリパラメータを削除
        if (router.query.reload === 'true') {
          router.replace(`/coach/advice?video_id=${video_id}`, undefined, { shallow: true })
        }
      }
    }
    loadData()
  }, [video_id, router.query.reload])

  // ページがフォーカスされた時にアドバイス一覧を再読み込み
  useEffect(() => {
    const handleFocus = () => {
      if (video_id && typeof video_id === 'string') {
        console.log('ページフォーカス - アドバイス一覧を再読み込み')
        loadAdvices()
      }
    }

    // ページが表示された時にも再読み込み
    const handleVisibilityChange = () => {
      if (!document.hidden && video_id && typeof video_id === 'string') {
        console.log('ページ表示 - アドバイス一覧を再読み込み')
        loadAdvices()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [video_id])

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

  const loadAdvices = async () => {
    if (!video_id || typeof video_id !== 'string') return
    
    try {
      setLoadingAdvices(true)
      const response = await fetch(`/api/v1/get-advices/${video_id}`)
      if (response.ok) {
        const data = await response.json()
        const advices = data.advices || []
        
        // 各アドバイスのSAS URLを最新に更新
        const updatedAdvices = await Promise.all(
          advices.map(async (advice: any) => {
            try {
              const latestSasUrl = await getSasUrlForImage(advice.captureUrl)
              if (latestSasUrl && latestSasUrl !== advice.captureSasUrl) {
                console.log('アドバイスSAS URLを更新:', advice.id, latestSasUrl)
                return {
                  ...advice,
                  captureSasUrl: latestSasUrl
                }
              }
            } catch (error) {
              console.error('アドバイスSAS URL更新エラー:', error)
            }
            return advice
          })
        )
        
        setAdvices(updatedAdvices)
      } else {
        // localStorageから取得を試行
        const saved = localStorage.getItem(`advices_${video_id}`)
        if (saved) {
          setAdvices(JSON.parse(saved))
        }
      }
    } catch (error) {
      console.error('アドバイス読み込みエラー:', error)
      // localStorageから取得を試行
      const saved = localStorage.getItem(`advices_${video_id}`)
      if (saved) {
        setAdvices(JSON.parse(saved))
      }
    } finally {
      setLoadingAdvices(false)
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



  const handleCreateNewAdvice = () => {
    router.push(`/coach/advice-new?video_id=${video_id}`)
  }

  const handleEditAdvice = async (adviceId: string) => {
    try {
      // 選択されたアドバイスを取得
      const selectedAdvice = advices.find(advice => advice.id === adviceId)
      if (!selectedAdvice) return
      
      // アドバイス編集画面に移動するためのデータをlocalStorageに保存
      const editData = {
        phase: selectedAdvice.phase,
        phaseCode: selectedAdvice.phaseCode,
        captureUrl: selectedAdvice.captureUrl,
        captureSasUrl: selectedAdvice.captureSasUrl,
        comment: selectedAdvice.comment,
        timestamp: selectedAdvice.timestamp,
        originalAdviceId: adviceId
      }
      localStorage.setItem('advice_edit_data', JSON.stringify(editData))
      
      // アドバイス編集画面に移動
      router.push(`/coach/advice-edit?video_id=${video_id}`)
    } catch (error) {
      console.error('アドバイス編集エラー:', error)
      alert('アドバイスの編集に失敗しました')
    }
  }

  const handleConfirmAdvice = async (adviceId: string) => {
    try {
      const updatedAdvices = advices.map(advice => 
        advice.id === adviceId 
          ? { ...advice, isConfirmed: true }
          : advice
      )
      setAdvices(updatedAdvices)
      
      // バックエンドに保存
      const response = await fetch(`/api/v1/save-advices/${video_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedAdvices)
      })

      if (response.ok) {
        localStorage.setItem(`advices_${video_id}`, JSON.stringify(updatedAdvices))
      }
    } catch (error) {
      console.error('アドバイス確認エラー:', error)
      alert('アドバイスの確認に失敗しました')
    }
  }

  const handleDeleteAdvice = async (adviceId: string) => {
    if (!confirm('このアドバイスを削除しますか？')) return
    
    try {
      const updatedAdvices = advices.filter(advice => advice.id !== adviceId)
      setAdvices(updatedAdvices)
      
      // バックエンドに保存
      const response = await fetch(`/api/v1/save-advices/${video_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedAdvices)
      })

      if (response.ok) {
        localStorage.setItem(`advices_${video_id}`, JSON.stringify(updatedAdvices))
      }
    } catch (error) {
      console.error('アドバイス削除エラー:', error)
      alert('アドバイスの削除に失敗しました')
    }
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
              <h1 className="text-3xl font-bold text-gray-900">アドバイス入力</h1>
              <p className="text-gray-600 mt-1">
                ユーザー: {extractUserNumber(videoData.video_url)} | 
                アップロード: {videoData.upload_date ? formatUploadDate(videoData.upload_date) : '読み込み中...'}
              </p>
            </div>
            <Link href="/coach" className="text-blue-600 hover:text-blue-700">
              ← コーチ画面に戻る
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

                     {/* New Advice Creation Button */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-800 mb-3">アドバイス作成</h3>
                <button
               onClick={handleCreateNewAdvice}
                  className="w-full py-3 px-4 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors"
                >
                  新しいアドバイスを作成
                </button>
                  </div>

           {/* Advice List */}
           <div className="mb-6">
             <h3 className="text-lg font-medium text-gray-800 mb-3">アドバイス一覧</h3>
             {loadingAdvices ? (
               <div className="bg-gray-50 rounded-lg p-4">
                 <div className="flex items-center justify-center">
                   <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mr-2"></div>
                   <p className="text-gray-600">アドバイスを読み込み中...</p>
                  </div>
                </div>
             ) : advices.length === 0 ? (
               <div className="bg-gray-50 rounded-lg p-4">
                 <p className="text-gray-600 text-center">アドバイスがまだ作成されていません</p>
                  </div>
             ) : (
               <div className="space-y-4">
                 {advices.map((advice) => (
                   <div key={advice.id} className={`bg-white border rounded-lg p-4 ${advice.isConfirmed ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                     <div className="flex items-start gap-4">
                       {/* Thumbnail */}
                       <div className="flex-shrink-0">
                         <img
                           src={advice.captureSasUrl || `/api/v1/proxy-file/${encodeURIComponent(advice.captureUrl)}`}
                           alt={`${advice.phase}キャプチャ`}
                           className="w-20 h-20 object-cover rounded border"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              if (!target.src.includes('proxy-file')) {
                               target.src = `/api/v1/proxy-file/${encodeURIComponent(advice.captureUrl)}`
                              }
                            }}
                            onLoad={(e) => {
                              // 画像が正常に読み込まれない場合は、最新のSAS URLを取得して再試行
                              const target = e.target as HTMLImageElement
                              if (target.naturalWidth === 0 || target.naturalHeight === 0) {
                                console.log('画像読み込み失敗、最新SAS URLを取得:', advice.captureUrl)
                                getSasUrlForImage(advice.captureUrl).then(sasUrl => {
                                  if (sasUrl && sasUrl !== advice.captureSasUrl) {
                                    console.log('最新SAS URLを設定:', sasUrl)
                                    target.src = sasUrl
                                  }
                                })
                              }
                            }}
                          />
                        </div>
                       
                       {/* Content */}
                       <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                           <span className={`px-2 py-1 text-xs font-medium rounded ${
                             advice.isConfirmed 
                               ? 'bg-green-100 text-green-800' 
                               : 'bg-blue-100 text-blue-800'
                           }`}>
                              {advice.phase}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatTime(advice.timestamp)}
                            </span>
                           {advice.isConfirmed && (
                             <span className="text-xs text-green-600 font-medium">✓ 確認済み</span>
                            )}
                          </div>
                         
                         <div className="text-sm text-gray-800 whitespace-pre-wrap mb-3">
                           {advice.comment}
                        </div>

                         <div className="flex items-center gap-2">
                           <button
                             onClick={() => handleEditAdvice(advice.id)}
                             className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                           >
                             編集
                           </button>
                           {!advice.isConfirmed && (
                             <button
                               onClick={() => handleConfirmAdvice(advice.id)}
                               className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-colors"
                             >
                               確認
                             </button>
                           )}
                           <button
                             onClick={() => handleDeleteAdvice(advice.id)}
                             className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
                           >
                             削除
                           </button>
                         </div>
                    </div>
                </div>
                   </div>
                 ))}
              </div>
            )}
           </div>

            {/* Video Info */}
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">動画ID</p>
                <p className="font-mono text-sm bg-gray-100 px-3 py-2 rounded text-gray-800">
                  {videoData.video_id}
                </p>
              </div>
              {videoData.swing_note && (
                <div>
                  <p className="text-sm text-gray-600">プレイヤーのメモ</p>
                  <p className="text-gray-800 bg-gray-100 px-3 py-2 rounded">
                    {videoData.swing_note}
                  </p>
                </div>
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
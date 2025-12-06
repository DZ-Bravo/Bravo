import { useState, useEffect } from 'react'
import Header from '../components/Header'
import { API_URL } from '../utils/api'
import './Store.css'

function Store() {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [products, setProducts] = useState([])
  const [totalProducts, setTotalProducts] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [favoriteProducts, setFavoriteProducts] = useState(new Set()) // 즐겨찾기한 상품 ID Set
  const itemsPerPage = 15

  const categories = [
    { id: 'all', name: '전체' },
    { id: 'shoes', name: '등산화' },
    { id: 'top', name: '상의' },
    { id: 'bottom', name: '하의' },
    { id: 'goods', name: '용품' }
  ]

  const categoryMap = {
    'all': null,
    'shoes': 'shoes',
    'top': 'top',
    'bottom': 'bottom',
    'goods': 'goods'
  }

  // 즐겨찾기 상태 가져오기
  useEffect(() => {
    const fetchFavoriteStatus = async () => {
      const token = localStorage.getItem('token')
      if (!token) return

      try {
        const response = await fetch(`${API_URL}/api/store/favorites/my`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          const favoriteIds = new Set((data.products || []).map(p => {
            const id = p._id?.toString() || p.id?.toString()
            return id
          }).filter(Boolean))
          setFavoriteProducts(favoriteIds)
        }
      } catch (error) {
        console.error('즐겨찾기 상태 조회 오류:', error)
      }
    }

    fetchFavoriteStatus()
  }, [])

  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoading(true)
      try {
        const category = categoryMap[selectedCategory]
        let allProducts = []

        if (category) {
          // 특정 카테고리만 가져오기
          const response = await fetch(`${API_URL}/api/store/${category}`)
          if (response.ok) {
            const data = await response.json()
            allProducts = data.products || data || []
            console.log(`${category} 상품 조회 성공:`, allProducts.length, '개')
          } else {
            const errorText = await response.text()
            console.error(`${category} 상품 조회 실패:`, response.status, errorText)
          }
        } else {
          // 전체: 모든 카테고리 가져오기
          const [shoesRes, topRes, bottomRes, goodsRes] = await Promise.all([
            fetch(`${API_URL}/api/store/shoes`).catch(err => {
              console.error('shoes API 오류:', err)
              return { ok: false }
            }),
            fetch(`${API_URL}/api/store/top`).catch(err => {
              console.error('top API 오류:', err)
              return { ok: false }
            }),
            fetch(`${API_URL}/api/store/bottom`).catch(err => {
              console.error('bottom API 오류:', err)
              return { ok: false }
            }),
            fetch(`${API_URL}/api/store/goods`).catch(err => {
              console.error('goods API 오류:', err)
              return { ok: false }
            })
          ])

          const shoes = shoesRes.ok ? await shoesRes.json().then(d => {
            const products = d.products || d || []
            console.log('shoes 상품:', products.length, '개')
            return products
          }).catch(err => {
            console.error('shoes 데이터 파싱 오류:', err)
            return []
          }) : []
          
          const top = topRes.ok ? await topRes.json().then(d => {
            const products = d.products || d || []
            console.log('top 상품:', products.length, '개')
            return products
          }).catch(err => {
            console.error('top 데이터 파싱 오류:', err)
            return []
          }) : []
          
          const bottom = bottomRes.ok ? await bottomRes.json().then(d => {
            const products = d.products || d || []
            console.log('bottom 상품:', products.length, '개')
            return products
          }).catch(err => {
            console.error('bottom 데이터 파싱 오류:', err)
            return []
          }) : []
          
          const goods = goodsRes.ok ? await goodsRes.json().then(d => {
            const products = d.products || d || []
            console.log('goods 상품:', products.length, '개')
            return products
          }).catch(err => {
            console.error('goods 데이터 파싱 오류:', err)
            return []
          }) : []

          allProducts = [...shoes, ...top, ...bottom, ...goods]
          console.log('전체 상품 개수:', allProducts.length)
        }

        // 페이지네이션 처리
        const startIndex = (currentPage - 1) * itemsPerPage
        const endIndex = startIndex + itemsPerPage
        const paginatedProducts = allProducts.slice(startIndex, endIndex)

        setProducts(paginatedProducts)
        setTotalProducts(allProducts.length)
        setTotalPages(Math.ceil(allProducts.length / itemsPerPage))
      } catch (error) {
        console.error('상품 목록 조회 오류:', error)
        setProducts([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchProducts()
  }, [selectedCategory, currentPage])

  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId)
    setCurrentPage(1) // 카테고리 변경 시 첫 페이지로
  }

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 페이지네이션에 표시할 페이지 번호 계산
  const getPageNumbers = () => {
    const maxVisible = 5 // 최대 표시할 페이지 수
    const pages = []
    
    if (totalPages <= maxVisible) {
      // 전체 페이지가 적으면 모두 표시
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // 현재 페이지 주변 페이지만 표시
      let start = Math.max(1, currentPage - Math.floor(maxVisible / 2))
      let end = Math.min(totalPages, start + maxVisible - 1)
      
      // 끝에 도달했을 때 시작점 조정
      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1)
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i)
      }
    }
    
    return pages
  }

  const formatPrice = (price) => {
    if (!price) return '0'
    return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  const calculateDiscountRate = (price, originalPrice) => {
    if (!originalPrice || !price || originalPrice <= price) return 0
    return Math.round(((originalPrice - price) / originalPrice) * 100)
  }

  // 즐겨찾기 토글
  const handleFavorite = async (productId, e) => {
    e.preventDefault()
    e.stopPropagation()

    const token = localStorage.getItem('token')
    if (!token) {
      alert('로그인이 필요합니다.')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/store/${productId}/favorite`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        
        // 즐겨찾기 상태 업데이트
        setFavoriteProducts(prev => {
          const newSet = new Set(prev)
          if (data.isFavorited) {
            newSet.add(productId)
          } else {
            newSet.delete(productId)
          }
          return newSet
        })

        // 찜목록 카운터 갱신을 위한 이벤트 발생
        window.dispatchEvent(new CustomEvent('favoritesUpdated', { 
          detail: { type: 'store', productId: productId, isFavorited: data.isFavorited }
        }))
        // localStorage에 플래그 설정
        localStorage.setItem('favoritesUpdated', Date.now().toString())
      } else {
        const errorData = await response.json()
        alert(errorData.error || '즐겨찾기 처리 중 오류가 발생했습니다.')
      }
    } catch (error) {
      console.error('즐겨찾기 처리 오류:', error)
      alert('즐겨찾기 처리 중 오류가 발생했습니다.')
    }
  }

  return (
    <div className="store-page">
      <Header />
      <main className="store-main">
        <div className="store-container">
          <div className="store-header">
            <h1 className="store-title">스토어</h1>
            <p className="store-subtitle">인기 브랜드부터 전문 장비까지, 신뢰할 수 있는 스토어로 연결합니다.</p>
          </div>
          
          <div className="store-categories">
            {categories.map((category) => (
              <button
                key={category.id}
                className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
                onClick={() => handleCategoryChange(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="store-loading">상품을 불러오는 중...</div>
          ) : products.length === 0 ? (
            <div className="store-empty">상품이 없습니다.</div>
          ) : (
            <>
              <div className="store-products-header">
                <span className="store-products-count">총 {totalProducts}개</span>
              </div>
              <div className="products-grid">
                {products.map((product) => {
                  const discountRate = calculateDiscountRate(product.price, product.original_price)
                  const productId = (product._id?.toString() || product.id?.toString() || String(product._id) || String(product.id))
                  const productUrl = product.url || null
                  
                  // 외부 링크가 있으면 외부 링크로, 없으면 클릭 불가
                  const handleCardClick = () => {
                    if (productUrl) {
                      window.open(productUrl, '_blank', 'noopener,noreferrer')
                    }
                  }
                  
                  return (
                    <div
                      key={productId}
                      className={`product-card ${productUrl ? 'clickable' : ''}`}
                      onClick={handleCardClick}
                      style={{ cursor: productUrl ? 'pointer' : 'default' }}
                    >
                      <div className="product-image-wrapper">
                        <div className="product-image">
                          <img 
                            src={product.thumbnails || product.thumbnail || product.image || '/images/placeholder.png'} 
                            alt={product.title || product.name} 
                            onError={(e) => {
                              e.target.src = '/images/placeholder.png'
                            }}
                          />
                        </div>
                        <button 
                          className={`product-like-btn ${favoriteProducts.has(productId) ? 'favorited' : ''}`}
                          onClick={(e) => handleFavorite(productId, e)}
                        >
                          {favoriteProducts.has(productId) ? '♥' : '♡'}
                        </button>
                      </div>
                      <div className="product-info">
                        {product.brand && (
                          <div className="product-brand">{product.brand}</div>
                        )}
                        <h3 className="product-name">{product.title || product.name}</h3>
                        <div className="product-price-section">
                          <div className="product-price-row">
                            <span className="product-price">{formatPrice(product.price)}</span>
                            {product.original_price && product.original_price > product.price && (
                              <>
                                <span className="product-original-price">{formatPrice(product.original_price)}</span>
                                {discountRate > 0 && (
                                  <span className="product-discount">{discountRate}%</span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div className="store-pagination">
                  <button
                    className="pagination-btn pagination-nav"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    title="이전 페이지"
                  >
                    &lt;
                  </button>
                  
                  {currentPage > 3 && totalPages > 5 && (
                    <>
                      <button
                        className="pagination-btn"
                        onClick={() => handlePageChange(1)}
                      >
                        1
                      </button>
                      {currentPage > 4 && <span className="pagination-ellipsis">...</span>}
                    </>
                  )}
                  
                  {getPageNumbers().map((page) => (
                    <button
                      key={page}
                      className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
                      onClick={() => handlePageChange(page)}
                    >
                      {page}
                    </button>
                  ))}
                  
                  {currentPage < totalPages - 2 && totalPages > 5 && (
                    <>
                      {currentPage < totalPages - 3 && <span className="pagination-ellipsis">...</span>}
                      <button
                        className="pagination-btn"
                        onClick={() => handlePageChange(totalPages)}
                      >
                        {totalPages}
                      </button>
                    </>
                  )}
                  
                  <button
                    className="pagination-btn pagination-nav"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    title="다음 페이지"
                  >
                    &gt;
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default Store


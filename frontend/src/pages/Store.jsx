import { Link } from 'react-router-dom'
import { useState } from 'react'
import Header from '../components/Header'
import './Store.css'

function Store() {
  const [selectedCategory, setSelectedCategory] = useState('all')

  const categories = [
    { id: 'all', name: '전체' },
    { id: 'shoes', name: '등산화' },
    { id: 'top', name: '상의' },
    { id: 'bottom', name: '하의' },
    { id: 'accessories', name: '용품' }
  ]

  const products = [
    {
      id: 1,
      name: '등산화 A',
      price: '129,000원',
      image: 'https://via.placeholder.com/300x300?text=등산화+A',
      category: 'shoes'
    },
    {
      id: 2,
      name: '등산화 B',
      price: '159,000원',
      image: 'https://via.placeholder.com/300x300?text=등산화+B',
      category: 'shoes'
    },
    {
      id: 3,
      name: '등산용 상의',
      price: '89,000원',
      image: 'https://via.placeholder.com/300x300?text=등산용+상의',
      category: 'top'
    },
    {
      id: 4,
      name: '등산용 티셔츠',
      price: '45,000원',
      image: 'https://via.placeholder.com/300x300?text=등산용+티셔츠',
      category: 'top'
    },
    {
      id: 5,
      name: '등산용 바지',
      price: '79,000원',
      image: 'https://via.placeholder.com/300x300?text=등산용+바지',
      category: 'bottom'
    },
    {
      id: 6,
      name: '등산용 반바지',
      price: '55,000원',
      image: 'https://via.placeholder.com/300x300?text=등산용+반바지',
      category: 'bottom'
    },
    {
      id: 7,
      name: '등산용 백팩',
      price: '89,000원',
      image: 'https://via.placeholder.com/300x300?text=등산용+백팩',
      category: 'accessories'
    },
    {
      id: 8,
      name: '등산 스틱',
      price: '45,000원',
      image: 'https://via.placeholder.com/300x300?text=등산+스틱',
      category: 'accessories'
    },
    {
      id: 9,
      name: '등산용 물병',
      price: '18,000원',
      image: 'https://via.placeholder.com/300x300?text=등산용+물병',
      category: 'accessories'
    }
  ]

  const filteredProducts = selectedCategory === 'all' 
    ? products 
    : products.filter(product => product.category === selectedCategory)

  return (
    <div className="store-page">
      <Header />
      <main className="store-main">
        <div className="store-container">
          <h1 className="store-title">스토어</h1>
          
          <div className="store-categories">
            {categories.map((category) => (
              <button
                key={category.id}
                className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>

          <div className="products-grid">
            {filteredProducts.map((product) => (
              <div key={product.id} className="product-card">
                <div className="product-image">
                  <img src={product.image} alt={product.name} />
                </div>
                <div className="product-info">
                  <h3 className="product-name">{product.name}</h3>
                  <p className="product-price">{product.price}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

export default Store


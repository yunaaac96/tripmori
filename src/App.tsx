function App() {
  return (
    <div className="min-h-screen bg-sky-50 flex items-center justify-center p-6">
      <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center border-4 border-blue-400">
        <h1 className="text-4xl font-black text-blue-600 mb-4">Tripmori</h1>
        <p className="text-slate-600 font-bold mb-6">✈️ 沖繩之旅開催中</p>
        <div className="bg-blue-100 p-4 rounded-xl mb-6">
          <p className="text-blue-800 text-sm">航班：IT230 | 4月23日</p>
        </div>
        <button className="bg-blue-600 text-white px-6 py-3 rounded-full font-bold hover:bg-blue-700 transition-all">
          查看行程
        </button>
      </div>
    </div>
  )
}
export default App
import Navbar from './Navbar';
import Footer from './Footer';

export default function Layout({ children }) {
  return (
    <>
      <Navbar />
      <main className="sipms-main">
        {children}
      </main>
      <Footer />
    </>
  );
}
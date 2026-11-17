import { useApp, useRoute } from './app.ts';
import { DemoBar, Footer, Guide, Header, Inbox, ToastHost } from './ui/Shell.tsx';
import { Home, NotFound, ProductPage, Profile, Search } from './ui/pages.tsx';
import { Admin, Edit, Manage, Register, Sell, Selling } from './ui/seller.tsx';

function Page() {
  const { parts, query } = useRoute();
  const [a, b, c] = parts;
  if (!a) return <Home />;
  if (a === 'search' && !b) return <Search q={query.get('q') ?? ''} city={query.get('city') ?? ''} />;
  if (a === 'item' && b && !c) return <ProductPage key={b} id={b} />;
  if (a === 'u' && b && !c) return <Profile key={b} dbid={b} />;
  if (a === 'sell' && !b) return <Sell />;
  if (a === 'selling' && !b) return <Selling />;
  if (a === 'selling' && b && !c) return <Manage key={b} id={b} />;
  if (a === 'selling' && b && c === 'edit') return <Edit key={b} id={b} />;
  if (a === 'admin' && !b) return <Admin />;
  if (a === 'register' && !b) return <Register />;
  return <NotFound />;
}

export function App() {
  useApp();
  return (
    <>
      <DemoBar />
      <Header />
      <Page />
      <Footer />
      <Guide />
      <Inbox />
      <ToastHost />
    </>
  );
}

import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import BlendsIndex from "./pages/BlendsIndex";
import BlendsCategory from "./pages/BlendsCategory";
import BlendsSubcategory from "./pages/BlendsSubcategory";
import BlendDetail from "./pages/BlendDetail";
import UiRegistry from "./pages/UiRegistry";
import DocsIndex from "./pages/DocsIndex";
import DocPage from "./pages/DocPage";
import CordisPrimer from "./pages/CordisPrimer";
import CordisPage from "./pages/CordisPage";
import EcosystemIndex from "./pages/EcosystemIndex";
import EcosystemPage from "./pages/EcosystemPage";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home/>}/>
      <Route path="/blends" element={<BlendsIndex/>}/>
      <Route path="/blends/b/:slug" element={<BlendDetail/>}/>
      <Route path="/blends/:category/:subcategory" element={<BlendsSubcategory/>}/>
      <Route path="/blends/:category" element={<BlendsCategory/>}/>
      <Route path="/ui" element={<UiRegistry/>}/>
      <Route path="/docs" element={<DocsIndex/>}/>
      <Route path="/docs/:group/:item" element={<DocPage/>}/>
      <Route path="/docs/:group" element={<DocPage/>}/>
      <Route path="/cordis" element={<CordisPrimer/>}/>
      <Route path="/cordis/:group/:item" element={<CordisPage/>}/>
      <Route path="/cordis/:group" element={<CordisPage/>}/>
      <Route path="/ecosystem" element={<EcosystemIndex/>}/>
      <Route path="/ecosystem/:page" element={<EcosystemPage/>}/>
      <Route path="/blog" element={<Blog/>}/>
      <Route path="/blog/:slug" element={<BlogPost/>}/>
      <Route path="*" element={<NotFound/>}/>
    </Routes>
  );
}

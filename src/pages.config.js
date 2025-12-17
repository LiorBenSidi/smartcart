import Admin from './pages/Admin';
import CatalogAdmin from './pages/CatalogAdmin';
import Home from './pages/Home';
import Landing from './pages/Landing';
import PriceComparison from './pages/PriceComparison';
import Profile from './pages/Profile';
import Recommendations from './pages/Recommendations';
import SmartCart from './pages/SmartCart';
import Upload from './pages/Upload';
import Receipt from './pages/Receipt';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Admin": Admin,
    "CatalogAdmin": CatalogAdmin,
    "Home": Home,
    "Landing": Landing,
    "PriceComparison": PriceComparison,
    "Profile": Profile,
    "Recommendations": Recommendations,
    "SmartCart": SmartCart,
    "Upload": Upload,
    "Receipt": Receipt,
}

export const pagesConfig = {
    mainPage: "Landing",
    Pages: PAGES,
    Layout: __Layout,
};
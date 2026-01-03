import CatalogAdmin from './pages/CatalogAdmin';
import Landing from './pages/Landing';
import NearbyStores from './pages/NearbyStores';
import PriceComparison from './pages/PriceComparison';
import Profile from './pages/Profile';
import Receipt from './pages/Receipt';
import Recommendations from './pages/Recommendations';
import SmartCart from './pages/SmartCart';
import Upload from './pages/Upload';
import Home from './pages/Home';
import Admin from './pages/Admin';
import __Layout from './Layout.jsx';


export const PAGES = {
    "CatalogAdmin": CatalogAdmin,
    "Landing": Landing,
    "NearbyStores": NearbyStores,
    "PriceComparison": PriceComparison,
    "Profile": Profile,
    "Receipt": Receipt,
    "Recommendations": Recommendations,
    "SmartCart": SmartCart,
    "Upload": Upload,
    "Home": Home,
    "Admin": Admin,
}

export const pagesConfig = {
    mainPage: "Landing",
    Pages: PAGES,
    Layout: __Layout,
};
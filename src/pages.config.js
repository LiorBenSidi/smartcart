import Admin from './pages/Admin';
import CatalogAdmin from './pages/CatalogAdmin';
import Home from './pages/Home';
import Landing from './pages/Landing';
import NearbyStores from './pages/NearbyStores';
import PriceComparison from './pages/PriceComparison';
import Profile from './pages/Profile';
import Receipt from './pages/Receipt';
import Recommendations from './pages/Recommendations';
import Upload from './pages/Upload';
import SmartCart from './pages/SmartCart';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Admin": Admin,
    "CatalogAdmin": CatalogAdmin,
    "Home": Home,
    "Landing": Landing,
    "NearbyStores": NearbyStores,
    "PriceComparison": PriceComparison,
    "Profile": Profile,
    "Receipt": Receipt,
    "Recommendations": Recommendations,
    "Upload": Upload,
    "SmartCart": SmartCart,
}

export const pagesConfig = {
    mainPage: "Landing",
    Pages: PAGES,
    Layout: __Layout,
};
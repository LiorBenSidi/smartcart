import CartAlternatives from './pages/CartAlternatives';
import Home from './pages/Home';
import Landing from './pages/Landing';
import NearbyStores from './pages/NearbyStores';
import Profile from './pages/Profile';
import Receipt from './pages/Receipt';
import Recommendations from './pages/Recommendations';
import SmartCart from './pages/SmartCart';
import Upload from './pages/Upload';
import PriceComparison from './pages/PriceComparison';
import CatalogAdmin from './pages/CatalogAdmin';
import Admin from './pages/Admin';
import __Layout from './Layout.jsx';


export const PAGES = {
    "CartAlternatives": CartAlternatives,
    "Home": Home,
    "Landing": Landing,
    "NearbyStores": NearbyStores,
    "Profile": Profile,
    "Receipt": Receipt,
    "Recommendations": Recommendations,
    "SmartCart": SmartCart,
    "Upload": Upload,
    "PriceComparison": PriceComparison,
    "CatalogAdmin": CatalogAdmin,
    "Admin": Admin,
}

export const pagesConfig = {
    mainPage: "Landing",
    Pages: PAGES,
    Layout: __Layout,
};
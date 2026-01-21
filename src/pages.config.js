import Admin from './pages/Admin';
import Landing from './pages/Landing';
import SmartCart from './pages/SmartCart';
import CatalogAdmin from './pages/CatalogAdmin';
import PriceComparison from './pages/PriceComparison';
import Feedback from './pages/Feedback';
import Home from './pages/Home';
import Receipt from './pages/Receipt';
import NearbyStores from './pages/NearbyStores';
import Recommendations from './pages/Recommendations';
import Profile from './pages/Profile';
import Upload from './pages/Upload';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Admin": Admin,
    "Landing": Landing,
    "SmartCart": SmartCart,
    "CatalogAdmin": CatalogAdmin,
    "PriceComparison": PriceComparison,
    "Feedback": Feedback,
    "Home": Home,
    "Receipt": Receipt,
    "NearbyStores": NearbyStores,
    "Recommendations": Recommendations,
    "Profile": Profile,
    "Upload": Upload,
}

export const pagesConfig = {
    mainPage: "Landing",
    Pages: PAGES,
    Layout: __Layout,
};
import Admin from './pages/Admin';
import CatalogAdmin from './pages/CatalogAdmin';
import Feedback from './pages/Feedback';
import Home from './pages/Home';
import Landing from './pages/Landing';
import NearbyStores from './pages/NearbyStores';
import PriceComparison from './pages/PriceComparison';
import Receipt from './pages/Receipt';
import Recommendations from './pages/Recommendations';
import SmartCart from './pages/SmartCart';
import Upload from './pages/Upload';
import Profile from './pages/Profile';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Admin": Admin,
    "CatalogAdmin": CatalogAdmin,
    "Feedback": Feedback,
    "Home": Home,
    "Landing": Landing,
    "NearbyStores": NearbyStores,
    "PriceComparison": PriceComparison,
    "Receipt": Receipt,
    "Recommendations": Recommendations,
    "SmartCart": SmartCart,
    "Upload": Upload,
    "Profile": Profile,
}

export const pagesConfig = {
    mainPage: "Landing",
    Pages: PAGES,
    Layout: __Layout,
};
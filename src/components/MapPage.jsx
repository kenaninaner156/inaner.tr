import React from 'react';
import MapLayout from './map/MapLayout';

const MapPage = ({ onOpenMenu, isMobile }) => {
    return (
        <div className="w-full h-screen relative overflow-hidden bg-[#07090E]">
            <MapLayout onOpenMenu={onOpenMenu} isMobile={isMobile} />
        </div>
    );
};

export default MapPage;

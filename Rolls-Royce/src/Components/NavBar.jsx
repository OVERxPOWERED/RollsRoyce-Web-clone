import React from 'react'
import './NavBar.css'
import { useState } from 'react';
import RRLogo1 from '../assets/icons8-rolls-royce.svg';
import globalVals from '../assets/globalVals.jsx';

function NavBar() {

    let [currLogo, setCurrLogo] = useState(RRLogo1);
    let [menuToggle, setMenuToggle] = useState(true);
    let [menuBoxStyle, setMenuBoxStyle] = useState({ left: '-43%' });

    function openClose() {
        if (menuToggle) {
            setMenuToggle(false);
            setMenuBoxStyle({ left: '0%' });
            globalVals.menuState = true;
        }
        else {
            setMenuToggle(true);
            setMenuBoxStyle({ left: '-43%' });
            globalVals.menuState = false;
        }
    }

    return (
        <div className='NavBox'>
            <div className='NavBar'>
                <span onClick={openClose} className='comp1'>MENU</span>
                <div style={menuBoxStyle} className="menuBox"></div>
                <span className='comp2'>
                    <a href="#"><img src={currLogo} alt="logo1" /></a>
                </span>
                <span className='comp3'>FIND A DEALER</span>
            </div>
            <span className='hr'></span>
        </div>
    )
}

export default NavBar;

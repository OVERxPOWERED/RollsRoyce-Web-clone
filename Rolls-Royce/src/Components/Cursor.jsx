import './Cursor.css'
import { useState } from 'react';
// import { useRef } from 'react';
import globalVals from '../assets/globalVals';


export default function Cursor(){

    let [cursorX, setX] = useState(0);
    let [cursorY, setY] = useState(0);
    let [Opacity, setOpacity] = useState(1);
    
    

    document.addEventListener('mousemove', (e) => {
        setX(e.clientX - 3);
        setY(e.clientY - 3);
    });
    document.addEventListener('mouseenter',()=>{
        setOpacity(1);
    });
    document.addEventListener('mouseleave',()=>{
        setOpacity(0);
    });

    return(
        <div style={{borderColor : `${globalVals.menuState ? 'black' : 'grey'}`,opacity : Opacity,left : cursorX, top : cursorY}} className='cursor'></div>
    )

}


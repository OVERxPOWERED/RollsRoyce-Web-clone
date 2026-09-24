import React from 'react'
import './Home.css'
import HomeImg1 from '../assets/cq5dam.web.1920.webp'
import HomeImg2 from '../assets/homePage2Img.jpg'
import HomeImg3 from '../assets/homePage3Img.jpg'

function Home() {
    return (
        <div className='HomeContainer'>
            <div style={{ backgroundImage: `url(${HomeImg1})` }} className="p1"></div>
            <div style={{ backgroundImage: `url(${HomeImg2})` }} className="p2"></div>
            <div style={{ backgroundImage: `url(${HomeImg3})` }} className="p3"></div>

            <span style={{"--Top" : 'calc((100vh - 5.8px - 7vh) / 2)'}}>
                <span></span>
            </span>
            <span style={{"--Top" : 'calc((100vh - 5.8px) / 2)'}}>
                <span></span>
            </span>
            <span style={{"--Top" : 'calc((100vh - 5.8px + 7vh) / 2)'}}>
                <span></span>
            </span>
        </div>
    )
}

export default Home;
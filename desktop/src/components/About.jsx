import React from 'react';
import './About.css';
import { APP_VERSION } from '../config/version';
import Logo from './Logo';

const About = ({ onClose }) => {
  return (
    <div className="about-modal">
      <div className="about-content">
        <button className="about-close" onClick={onClose}>×</button>
        <div className="about-logo"><Logo /></div>
        <h1>
          <span className="about-version">v{APP_VERSION}</span>
        </h1>
        
        <div className="about-body">
        <section className="about-section">
          <p>The 2025 G20 <a href="https://g20.org/wp-content/uploads/2025/11/2025-G20-Summit-Declaration.pdf" target="_blank">Leader's declaration</a> is an acknowledgement of the urgent need to address climate change, ensure food security and sustainability. Statements of solidarity and intent are cheap though, but this signed declaration should also be used as a way to track progress and enable civic society to hold these leaders accountable.</p>

          <p>Earth observation has become an essential part of understanding, documenting and witnessing the impact of climate change. Access to current and historic data allows us to objectively monitor and analyse change.</p>

          <p>The problem has always been, and continues to be, demystifying the data and empowering journalists and activists with simple access and clear narratives that can support action and education.</p>

          <h2>Why Gibson?</h2>
          <p>Earth observation tools like ESA's <a href="https://browser.cloud.esa.int/" target="_blank">Copernicus Browser</a> and NASA's <a href="https://worldview.earthdata.nasa.gov/" target="_blank">Worldview</a> are incredible and should remain the goto resources for any investigation, but we also have <strong>direct access</strong> to NASA's <a href="https://nasa-gibs.github.io/gibs-api-docs/" target="_blank" rel="noopener noreferrer">GIBS API</a>. The imagery is diverse, near real-time and it is <strong>free</strong>. It is the same imagery that drives NASA's Worldview and many other online tools.</p>

          <p>Gibson is an ongoing learning experiment to understand the extent and usability of this dataset, to help others use the set within their own projects and to offer a curated list of useful metrics with an Africa-first lens. It is also a companion tool to Africa Data Hub’s <a href="https://www.africadatahub.org/dashboards/climate-observer" target="_blank">Climate Observer</a>.</p>

          <h2>How Gibson works</h2>
          <p>The data available through GIBS is extensive and covers all areas from fire anomalies, temperature and precipitation to air quality, land-cover and vegetation indices.</p>

          <p>Every layer in GIBS is accessible as images through a predictable pattern:</p>

          <p>https://gibs.earthdata.nasa.gov/wmts<br/>
            /<strong>--Projection--</strong><br/>
            /best<br/>
            /<strong>--LayerIdentifier--</strong><br/>
            /default<br/>
            /<strong>--Time--</strong><br/>
            /<strong>--TileMatrixSet--</strong><br/>
            /<strong>--TileMatrix--</strong><br/>
            /<strong>--TileRow--</strong><br/>
            /<strong>--TileCol--</strong><br/>
            .<strong>--FormatExt--</strong></p>


          <p>This might for instance be called as:</p>
          <p>https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2025-11-30/250m/6/13/36.jpg</p>

          <p>
            <img src="https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2025-11-30/250m/6/13/36.jpg" alt="Example GIBS Layer: MODIS Terra Corrected Reflectance True Color" className="about-example-image" />
          </p>

          <p>The tricky thing is that not all layers support all projections, dates and resolutions and the <strong>documentation is vague</strong>. One aim of Gibson is to understand and document useful layers and their available options.</p>

        </section>

        <section className="about-section">
          <h2>Use Cases</h2>
          <p>Gibson and the GIBS dataset can be used for a variety of applications, including:</p>
          <ul>
            <li>Monitoring deforestation and land use changes</li>
            <li>Tracking urbanization and infrastructure development</li>
            <li>Assessing the impacts of climate change on vulnerable regions</li>
            <li>Supporting disaster response and recovery efforts</li>
          </ul>
        </section>

        <section className="about-section">
          <h2>Complimentary Tools</h2>
          <p>Gibson is designed to complement other Earth observation tools and platforms. It is a companion to the <a href="https://www.africadatahub.org/dashboards/climate-observer" target="_blank">Climate Observer</a>.</p>
          <p>Both tools aim to provide users with comprehensive insights into environmental changes and trends across Africa.</p>
          <p>But for in depth analysis and understanding of satellite data and real-world use cases, we would also strongly recommend exploring Digital Earth Africa's <a href="https://www.digitalearthafrica.org/" target="_blank">platform</a> and tools.</p>
          <p>The repository of <a href="https://sandbox.digitalearth.africa/" target="_blank">Digital Earth Africa's Jupyter Notebooks</a> is a great resource for learning and experimenting with satellite data.</p>
        </section>

        <section className="about-section useful-links">
          <h2>Useful Links</h2>
          <div className="links-grid">
            <div className="link-category">
              <h3>Data & Documentation</h3>
              <ul>
                <li>
                  <a href="/gibs">
                    GIBS Capabilities Table
                  </a>
                </li>
                <li>
                  <a href="https://nasa-gibs.github.io/gibs-api-docs/" target="_blank" rel="noopener noreferrer">
                    NASA GIBS API Documentation
                  </a>
                </li>
                <li>
                  <a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noopener noreferrer">
                    NASA Worldview (Official GIBS Viewer)
                  </a>
                </li>
                <li>
                  <a href="https://earthdata.nasa.gov/" target="_blank" rel="noopener noreferrer">
                    NASA Earthdata Portal
                  </a>
                </li>
                <li>
                  <a href="https://search.earthdata.nasa.gov/" target="_blank" rel="noopener noreferrer">
                    Earthdata Search
                  </a>
                </li>
              </ul>
            </div>

            <div className="link-category">
              <h3>Satellite Missions</h3>
              <ul>
                <li>
                  <a href="https://modis.gsfc.nasa.gov/" target="_blank" rel="noopener noreferrer">
                    MODIS Mission
                  </a>
                </li>
                <li>
                  <a href="https://www.nasa.gov/mission_pages/NPP/main/index.html" target="_blank" rel="noopener noreferrer">
                    VIIRS/SNPP Mission
                  </a>
                </li>
                <li>
                  <a href="https://smap.jpl.nasa.gov/" target="_blank" rel="noopener noreferrer">
                    SMAP Mission
                  </a>
                </li>
                <li>
                  <a href="https://gpm.nasa.gov/" target="_blank" rel="noopener noreferrer">
                    GPM Mission
                  </a>
                </li>
              </ul>
            </div>

            

          
          </div>
        </section>

        <section className="about-section">
          <h2>Credits</h2>
          <p>
            Developed by Dirk Meerkotter at <a href="https://www.openup.org.za" target="_blank">OpenUp</a> and <a href="https://www.africadatahub.org" target="_blank">Africa Data Hub</a>.
          </p>
          <p>
            Satellite imagery courtesy of NASA's Global Imagery Browse Services (GIBS) and 
            the Earth Observing System Data and Information System (EOSDIS).
          </p>
        </section>

        <footer className="about-footer">
          <p>
            For questions, feedback, or technical support, please contact us at{' '}
            <a href="mailto:info@africadatahub.org">info@africadatahub.org</a>
          </p>
        </footer>
        <div className="modal-adh-logo">
          <Logo secondary />
        </div>
        </div>
      </div>
    </div>
  );
};

export default About;

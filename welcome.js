/* Welcome is presentation only; existing login and document logic stay intact. */
(() => {
  const video=document.getElementById('welcome-video');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  async function play(){try{await video.play();}catch{}}
  document.querySelectorAll('[data-welcome-enter]').forEach(button=>button.addEventListener('click',()=>{
    video.pause();document.body.classList.remove('welcome-open');
    window.location.hash='login';window.scrollTo(0,0);
    openLoginModal();
  }));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause();});
  if(!reduced.matches)play();
})();

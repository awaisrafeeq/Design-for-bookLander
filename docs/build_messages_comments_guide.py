from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'BookLender_Messages_and_Comments_Client_Guide.docx'

doc = Document()
sec = doc.sections[0]
sec.top_margin = Inches(.68)
sec.bottom_margin = Inches(.62)
sec.left_margin = Inches(.7)
sec.right_margin = Inches(.7)

styles = doc.styles
styles['Normal'].font.name = 'Aptos'
styles['Normal'].font.size = Pt(10)
styles['Normal'].paragraph_format.space_after = Pt(6)
styles['Normal'].paragraph_format.line_spacing = 1.12
for name, size, before, after in [('Title', 23, 0, 7), ('Heading 1', 15, 12, 6), ('Heading 2', 11, 9, 3)]:
    s = styles[name]
    s.font.name = 'Aptos Display' if name != 'Heading 2' else 'Aptos'
    s.font.size = Pt(size)
    s.font.bold = name != 'Title'
    s.font.color.rgb = RGBColor(0,0,0)
    s.paragraph_format.space_before = Pt(before)
    s.paragraph_format.space_after = Pt(after)
    s.paragraph_format.keep_with_next = True

def p(text='', style=None):
    return doc.add_paragraph(text, style)

def qa(question, answer):
    doc.add_paragraph(question, 'Heading 2')
    p('Answer: ' + answer)

def screenshot(path, caption):
    para = doc.add_paragraph()
    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    para.paragraph_format.space_after = Pt(3)
    para.add_run().add_picture(str(ROOT / path), width=Inches(7.05))
    c = doc.add_paragraph(caption)
    c.alignment = WD_ALIGN_PARAGRAPH.CENTER
    c.runs[0].italic = True
    c.runs[0].font.size = Pt(8)
    c.paragraph_format.space_after = Pt(8)

doc.add_paragraph('BookLender Studio Messages and Comments', 'Title')
p('Client guide  |  10 November 2026')
p('This guide shows how to review and respond to direct messages and post comments in BookLender Studio. The screenshots were captured from the signed-in application. The examples show live account content, so counts and conversations can change after refresh.')

doc.add_paragraph('Messages', 'Heading 1')
screenshot('BookLender_Messages_Live.png', 'Messages page with a selected conversation, filters, thread and reply box.')
qa('1. Where do I find a conversation?', 'Open Messages from the left navigation. The conversation list shows the sender, connected platform and account, a message preview, and the latest activity. Select a conversation to read its thread on the right.')
qa('2. How do search and filters work?', 'Search matches the conversations currently loaded in the list. Use Platforms and Accounts to select one or more connected sources. Clear the selection to see all available conversations, and load more when you need older items.')
qa('3. How do I reply?', 'Write in the box at the bottom of the selected conversation. Press Enter to send; press Shift and Enter for a new line. The message is sent through the connected social account. A platform may refuse a reply when its allowed response window has expired.')
qa('4. What can I do with an attachment or reaction?', 'Choose Load attachment to display media when an attachment is available. Hover over a message to open the reaction control; available reactions depend on the connected platform and Zernio. Use Refresh to fetch the latest thread state.')

doc.add_page_break()
doc.add_paragraph('Comments', 'Heading 1')
screenshot('BookLender_Comments_Live.png', 'Comments page showing the post list, selected Facebook post, comment thread and reply controls.')
qa('5. How do I find comments on a post?', 'Open Comments from the left navigation. Posts appear in the left list with their platform, account and visible comment count. Search the loaded posts or use the Platforms and Accounts filters. Select a post to open its comments on the right.')
qa('6. What does the selected post show?', 'The header identifies the post and its connected account. Comments appear as a thread, with replies indented under the parent comment. The header count and post-list count reflect the comments returned for that post.')
qa('7. How do I respond to a specific comment?', 'Choose Reply under that comment, type your response and submit it. A reply remains nested under the comment it answers. The Write a comment box at the bottom creates a comment on the post itself.')
qa('8. What do Like and Open post do?', 'Like applies the platform-supported reaction when available; the visible count shows returned likes. Open post opens the original social post for context. Action availability varies by platform and account permissions.')

doc.add_paragraph('Updates and access', 'Heading 1')
qa('9. Why might a new message or comment not appear immediately?', 'BookLender reads conversation and comment data through Zernio and the connected social platform. Press Refresh, confirm that the right account and platform are selected, and allow a few minutes for provider updates. Search only covers items already loaded on the page.')
qa('10. Who can use these pages?', 'Team and Roles controls access to Messages and Comments. An administrator can grant the relevant page and action permissions. If a teammate cannot open a page or perform an action, check their role and the connected account permissions.')

footer = sec.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
footer.add_run('BookLender Studio  •  Client guide').font.size = Pt(8)

doc.save(OUT)
print(OUT)
